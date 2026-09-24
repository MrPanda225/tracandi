import { useEffect, useId, useState } from 'react';
import { isAbortError, messageOf } from '../../api/client';
import {
  disconnectGmail,
  fetchGmailAuthorizationUrl,
  fetchGmailStatus,
  type GmailStatus,
  reclassifyGmail,
  setGmailApplyLabels,
  setGmailLookbackDays,
  synchroniseGmail,
} from '../../api/gmail';
import { followRuns, isRunning, type RunState } from '../../api/jobs';
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

/** EF-GML-04: what a synchronisation did, in words, and whether messages are still waiting. */
const describeCounters = ({ counters }: RunState) =>
  `${countOf(counters['messages_read'] ?? 0, 'message lu', 'messages lus')}, ` +
  `${countOf(counters['messages_retained'] ?? 0, 'retenu', 'retenus')}, ` +
  `${countOf(counters['messages_classified'] ?? 0, 'classé', 'classés')}`;

/** EF-GML-04, EF-EXE-03 : ce qu'une synchronisation terminée a fait, et ce qu'il reste éventuellement à traiter. */
const describeReport = (run: RunState) =>
  `Synchronisation terminée : ${describeCounters(run)}.` +
  ((run.counters['messages_pending'] ?? 0) > 0
    ? ' Il reste des messages à traiter : relancez pour continuer.'
    : '');

/**
 * EF-GML-04, EF-EXE-01 : la passe est mise en file et le bouton rend la main aussitôt ; l'avancement arrive par le
 * flux des exécutions (EF-EXE-04), donc un rechargement ne le perd pas.
 */
function SynchroniseButton({
  run,
  onQueued,
  onFailure,
}: {
  run: RunState | null;
  onQueued: () => void;
  onFailure: (message: string) => void;
}) {
  const [isAsking, setIsAsking] = useState(false);
  const busy = isAsking || isRunning(run);

  const handleSynchronise = async () => {
    setIsAsking(true);
    try {
      await synchroniseGmail();
      onQueued();
    } catch (failure) {
      onFailure(messageOf(failure));
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <button
      type="button"
      className="btn"
      disabled={busy}
      aria-busy={busy}
      onClick={() => void handleSynchronise()}
    >
      {busy ? 'Synchronisation…' : 'Synchroniser maintenant'}
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

/** EF-GML-20 : ce qu'une relecture a fait, en mots. */
const describeReclassification = ({ counters }: RunState) =>
  `${countOf(counters['messages_read'] ?? 0, 'message relu', 'messages relus')}, ` +
  `${countOf(counters['messages_corrected'] ?? 0, 'corrigé', 'corrigés')} en refus`;

/**
 * EF-GML-20 : relit dans Gmail les messages déjà classés « accusé de réception » et corrige ceux qui refusent en
 * fait la candidature. Mise en file comme une synchronisation ; l'avancement arrive par le flux (EF-EXE-04).
 */
function ReclassifyOption({
  run,
  onQueued,
  onFailure,
}: {
  run: RunState | null;
  onQueued: () => void;
  onFailure: (message: string) => void;
}) {
  const hintId = useId();
  const [isAsking, setIsAsking] = useState(false);
  const busy = isAsking || isRunning(run);

  const handleReclassify = async () => {
    setIsAsking(true);
    try {
      await reclassifyGmail();
      onQueued();
    } catch (failure) {
      onFailure(messageOf(failure));
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="gmail-settings__option">
      <p className="gmail-settings__option-label">Accusés de réception déjà classés</p>
      <p id={hintId} className="gmail-settings__meta">
        Tracandi relit dans Gmail les messages rangés « En attente » et passe en « Refusée » ceux qui annoncent en fait
        un refus plus loin dans le message. Rien d’autre n’est modifié.
      </p>
      {isRunning(run) && (
        <p className="gmail-settings__meta" role="status" aria-live="polite">
          {run?.outcome === 'queued'
            ? 'Relecture en attente de son tour…'
            : `Relecture en cours : ${describeReclassification(run as RunState)}…`}
        </p>
      )}
      <div>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={busy}
          aria-busy={busy}
          aria-describedby={hintId}
          onClick={() => void handleReclassify()}
        >
          {busy ? 'Relecture…' : 'Relire les accusés de réception'}
        </button>
      </div>
    </div>
  );
}

/** EF-CFG-04: periods offered for the first synchronisation; the API accepts 1 to 365 days. */
const LOOKBACK_CHOICES = [
  { days: 7, label: '7 derniers jours' },
  { days: 30, label: '1 mois' },
  { days: 90, label: '3 mois' },
  { days: 180, label: '6 mois' },
  { days: 365, label: '1 an' },
];

/**
 * EF-CFG-04: period read on the first synchronisation (N of EF-GML-05). A short period keeps the first
 * synchronisation inside Gmail's quota; the select goes back if the API refuses the change.
 */
function LookbackOption({
  days,
  isFirstSyncDone,
  onFailure,
}: {
  days: number;
  isFirstSyncDone: boolean;
  onFailure: (message: string) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const [selected, setSelected] = useState(days);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (chosen: number) => {
    const previous = selected;
    setSelected(chosen);
    setIsSaving(true);
    try {
      await setGmailLookbackDays(chosen);
    } catch (failure) {
      setSelected(previous);
      onFailure(messageOf(failure));
    } finally {
      setIsSaving(false);
    }
  };

  // A period the API returns that is not in the list (set elsewhere) stays selectable.
  const choices = LOOKBACK_CHOICES.some((choice) => choice.days === selected)
    ? LOOKBACK_CHOICES
    : [...LOOKBACK_CHOICES, { days: selected, label: `${selected} jours` }].sort((a, b) => a.days - b.days);

  return (
    <div className="gmail-settings__option gmail-settings__option--period">
      <label className="gmail-settings__option-label" htmlFor={fieldId}>
        Période à synchroniser
      </label>
      <select
        id={fieldId}
        className="control gmail-settings__select"
        value={selected}
        disabled={isSaving}
        aria-describedby={hintId}
        onChange={(event) => void handleChange(Number(event.target.value))}
      >
        {choices.map((choice) => (
          <option key={choice.days} value={choice.days}>
            {choice.label}
          </option>
        ))}
      </select>
      <p id={hintId} className="gmail-settings__meta">
        {isFirstSyncDone
          ? 'La première synchronisation est faite : Tracandi ne lit plus que les nouveaux messages. Cette période ' +
            'resservira après une reconnexion de la boîte.'
          : 'Messages lus lors de la première synchronisation. Une période courte évite les limites de l’API Gmail.'}
      </p>
    </div>
  );
}

function ConnectedMailbox({
  gmail,
  run,
  reclassifyRun,
  onQueued,
  onDisconnected,
  onFailure,
}: {
  gmail: Extract<GmailStatus, { connected: true }>;
  run: RunState | null;
  reclassifyRun: RunState | null;
  onQueued: () => void;
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
          {gmail.lastRunAt
            ? `Dernière synchronisation : ${formatDateTime(gmail.lastRunAt)}`
            : 'Dernière synchronisation : pas encore'}
        </p>
        {isRunning(run) && (
          // EF-EXE-03 : ce que la passe en cours a déjà fait, rafraîchi par le flux.
          <p className="gmail-settings__meta" role="status" aria-live="polite">
            {run?.outcome === 'queued'
              ? 'Synchronisation en attente de son tour…'
              : `Synchronisation en cours : ${describeCounters(run as RunState)}…`}
          </p>
        )}
        {gmail.lastRunAt && !gmail.lastSyncAt && (
          // EF-GML-06: passes are bounded, so a first synchronisation over a long period takes several of them.
          <p className="gmail-settings__meta">
            Rattrapage en cours : les messages les plus récents sont traités d’abord. Relancez jusqu’à ce que le
            compte de messages lus tombe à zéro.
          </p>
        )}
      </div>
      <LookbackOption
        days={gmail.lookbackDays}
        isFirstSyncDone={gmail.lastSyncAt !== null}
        onFailure={onFailure}
      />
      <LabelsOption isOn={gmail.applyLabels} onFailure={onFailure} />
      {!gmail.authorizationExpired && (
        <ReclassifyOption run={reclassifyRun} onQueued={onQueued} onFailure={onFailure} />
      )}
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
              <SynchroniseButton run={run} onQueued={onQueued} onFailure={onFailure} />
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
 * through Google's consent page (EF-GML-01), manual synchronisation (EF-GML-04), period of the first synchronisation
 * (EF-CFG-04), writing of labels (EF-GML-17), reading the acknowledgements again (EF-GML-20), disconnection after
 * confirmation (EF-GML-02), reconnection of an expired authorisation (Q-11).
 */
export function GmailSettings({ initialNotice }: { initialNotice: Notice | null }) {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const [isLeaving, setIsLeaving] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [reclassifyRun, setReclassifyRun] = useState<RunState | null>(null);

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

  // EF-EXE-04 : l'avancement arrive tout seul, y compris pour une passe lancée par le planificateur.
  useEffect(() => {
    const stop = followRuns((received) => {
      if (received.job === 'gmail_reclassify') {
        setReclassifyRun(received);
        if (received.outcome === 'success') {
          setNotice({ tone: 'success', text: `Relecture terminée : ${describeReclassification(received)}.` });
        }
        if (received.outcome === 'failure') {
          setNotice({ tone: 'error', text: received.error ?? 'La relecture a échoué.' });
        }
        return;
      }
      if (received.job !== 'gmail_sync') return;
      setRun(received);
      if (received.outcome === 'success') {
        setNotice({ tone: 'success', text: describeReport(received) });
        void loadStatus();
      }
      if (received.outcome === 'failure') {
        setNotice({ tone: 'error', text: received.error ?? 'La synchronisation a échoué.' });
      }
    });
    return stop;
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
          run={run}
          reclassifyRun={reclassifyRun}
          onQueued={() => setNotice(null)}
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
