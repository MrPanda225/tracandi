import { useEffect, useId, useState } from 'react';
import { isAbortError, messageOf } from '../../api/client';
import {
  disconnectGmail,
  fetchGmailAuthorizationUrl,
  fetchGmailStatus,
  type GmailStatus,
  setGmailApplyLabels,
  synchroniseGmail,
  type SyncReport,
} from '../../api/gmail';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';
import { leaveFor } from '../../lib/browser';
import { formatDate, formatDateTime } from '../../lib/format';

export interface Notice {
  tone: 'success' | 'error';
  text: string;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; gmail: GmailStatus };

const countOf = (count: number, singular: string, plural: string) => `${count} ${count > 1 ? plural : singular}`;

/** EF-GML-04: what a synchronisation did, in words. */
const describeReport = ({ read, retained, classified }: SyncReport) =>
  `Synchronisation terminée : ${countOf(read, 'message lu', 'messages lus')}, ${countOf(retained, 'retenu', 'retenus')}, ` +
  `${countOf(classified, 'classé', 'classés')}.`;

/** EF-GML-04: manual synchronisation; the button waits until the API answers (ENF-UTI-03). */
function SynchroniseButton({
  onSynchronised,
  onFailure,
}: {
  onSynchronised: (report: SyncReport) => void;
  onFailure: (message: string) => void;
}) {
  const [isRunning, setIsRunning] = useState(false);

  const handleSynchronise = async () => {
    setIsRunning(true);
    try {
      onSynchronised(await synchroniseGmail());
    } catch (failure) {
      onFailure(messageOf(failure));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <button
      type="button"
      className="btn"
      disabled={isRunning}
      aria-busy={isRunning}
      onClick={() => void handleSynchronise()}
    >
      {isRunning ? 'Synchronisation…' : 'Synchroniser maintenant'}
    </button>
  );
}

/** EF-GML-01: leaves for Google's consent page; the button waits while the address is asked (ENF-UTI-03). */
function ConnectButton({ label, isLeaving, onConnect }: { label: string; isLeaving: boolean; onConnect: () => void }) {
  return (
    <button type="button" className="btn" disabled={isLeaving} aria-busy={isLeaving} onClick={onConnect}>
      {isLeaving ? 'Redirection vers Google…' : label}
    </button>
  );
}

/** EF-GML-17: writing of Gmail labels, on by default; the box goes back if the API refuses the change. */
function LabelsOption({ isOn, onFailure }: { isOn: boolean; onFailure: (message: string) => void }) {
  const hintId = useId();
  const [isChecked, setIsChecked] = useState(isOn);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (applyLabels: boolean) => {
    setIsChecked(applyLabels);
    setIsSaving(true);
    try {
      await setGmailApplyLabels(applyLabels);
    } catch (failure) {
      setIsChecked(!applyLabels);
      onFailure(messageOf(failure));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="gmail-settings__option">
      <label className="gmail-settings__option-label">
        <input
          type="checkbox"
          checked={isChecked}
          disabled={isSaving}
          aria-describedby={hintId}
          onChange={(event) => void handleChange(event.target.checked)}
        />
        Ranger les fils avec des libellés Gmail
      </label>
      <p id={hintId} className="gmail-settings__meta">
        Libellés « Candidatures/‹Entreprise› », « Statut/… » et « Alertes emploi ». Décoché, Tracandi lit votre boîte
        sans rien y modifier.
      </p>
    </div>
  );
}

function ConnectedMailbox({
  gmail,
  onSynchronised,
  onDisconnected,
  onFailure,
}: {
  gmail: Extract<GmailStatus, { connected: true }>;
  onSynchronised: (report: SyncReport) => void;
  onDisconnected: () => void;
  onFailure: (message: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectGmail();
      onDisconnected();
    } catch (failure) {
      onFailure(messageOf(failure));
      setIsDisconnecting(false);
      setIsConfirming(false);
    }
  };

  return (
    <>
      <div className="gmail-settings__mailbox">
        <p className="gmail-settings__address">{gmail.emailAddress}</p>
        <p className="gmail-settings__meta">Connectée depuis le {formatDate(gmail.connectedAt)}</p>
        <p className="gmail-settings__meta">
          {gmail.lastSyncAt
            ? `Dernière synchronisation : ${formatDateTime(gmail.lastSyncAt)}`
            : 'Dernière synchronisation : pas encore'}
        </p>
      </div>
      <LabelsOption isOn={gmail.applyLabels} onFailure={onFailure} />
      <div className="gmail-settings__actions">
        {isConfirming ? (
          <>
            <p className="gmail-settings__confirm">
              Tracandi n’aura plus accès à votre boîte et le jeton sera révoqué chez Google.
            </p>
            <button type="button" className="btn btn--quiet" onClick={() => setIsConfirming(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn"
              disabled={isDisconnecting}
              aria-busy={isDisconnecting}
              onClick={() => void handleDisconnect()}
            >
              {isDisconnecting ? 'Déconnexion…' : 'Confirmer la déconnexion'}
            </button>
          </>
        ) : (
          <>
            {!gmail.authorizationExpired && (
              <SynchroniseButton onSynchronised={onSynchronised} onFailure={onFailure} />
            )}
            <button type="button" className="btn btn--quiet" onClick={() => setIsConfirming(true)}>
              Déconnecter Gmail
            </button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Gmail block of the settings: connected address, connection day and last synchronisation (EF-CFG-01), connection
 * through Google's consent page (EF-GML-01), manual synchronisation (EF-GML-04), writing of labels (EF-GML-17),
 * disconnection after confirmation (EF-GML-02), reconnection of an expired authorisation (Q-11).
 */
export function GmailSettings({ initialNotice }: { initialNotice: Notice | null }) {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const [isLeaving, setIsLeaving] = useState(false);

  const loadStatus = (signal?: AbortSignal) =>
    fetchGmailStatus(signal)
      .then((gmail) => setState({ status: 'ready', gmail }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'error', message: messageOf(error) });
      });

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, []);

  const handleConnect = async () => {
    setIsLeaving(true);
    setNotice(null);
    try {
      leaveFor((await fetchGmailAuthorizationUrl()).url);
    } catch (failure) {
      setNotice({ tone: 'error', text: messageOf(failure) });
      setIsLeaving(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="settings-card__title">
        Boîte Gmail
      </h2>
      <p className="settings-card__lede">
        Tracandi lit vos e-mails de candidature pour suivre chaque démarche et range leurs fils avec des libellés. Il
        ne supprime jamais de message.
      </p>
      {notice && <Flash tone={notice.tone}>{notice.text}</Flash>}

      {state.status === 'loading' && (
        <div className="gmail-settings__loading" role="status" aria-live="polite">
          <span className="visually-hidden">Chargement de la connexion Gmail…</span>
          <Skeleton width="45%" height="1rem" />
          <Skeleton width="30%" height="0.8rem" />
        </div>
      )}
      {state.status === 'error' && <Flash>{state.message}</Flash>}
      {state.status === 'ready' && state.gmail.connected && state.gmail.authorizationExpired && (
        <div className="gmail-settings__expired">
          <Flash>
            L’autorisation Gmail a expiré : la synchronisation est en pause. Google la limite à 7 jours tant que le
            projet est en mode test ; reconnectez Gmail pour la reprendre.
          </Flash>
          <ConnectButton label="Reconnecter Gmail" isLeaving={isLeaving} onConnect={() => void handleConnect()} />
        </div>
      )}
      {state.status === 'ready' && state.gmail.connected && (
        <ConnectedMailbox
          gmail={state.gmail}
          onSynchronised={(report) => {
            setNotice({ tone: 'success', text: describeReport(report) });
            // The date of the last synchronisation is the API's.
            void loadStatus();
          }}
          onDisconnected={() => {
            setState({ status: 'ready', gmail: { connected: false } });
            setNotice({ tone: 'success', text: 'Gmail est déconnecté : plus aucun accès à votre boîte n’est conservé.' });
          }}
          onFailure={(message) => setNotice({ tone: 'error', text: message })}
        />
      )}
      {state.status === 'ready' && !state.gmail.connected && (
        <div className="gmail-settings__actions">
          <p className="gmail-settings__meta">Aucune boîte connectée.</p>
          <ConnectButton label="Connecter Gmail" isLeaving={isLeaving} onConnect={() => void handleConnect()} />
        </div>
      )}
    </section>
  );
}
