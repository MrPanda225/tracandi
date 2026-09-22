import { useEffect, useId, useState } from 'react';
import { isAbortError, messageOf } from '../../api/client';
import { disconnectGmail, fetchGmailAuthorizationUrl, fetchGmailStatus, type GmailStatus } from '../../api/gmail';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';
import { leaveFor } from '../../lib/browser';
import { formatDate, formatDateTime } from '../../lib/format';

export interface Notice {
  tone: 'success' | 'error';
  text: string;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; gmail: GmailStatus };

function ConnectedMailbox({
  gmail,
  onDisconnected,
  onFailure,
}: {
  gmail: Extract<GmailStatus, { connected: true }>;
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
          <button type="button" className="btn btn--quiet" onClick={() => setIsConfirming(true)}>
            Déconnecter Gmail
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Gmail block of the settings: connected address, connection day and last synchronisation (EF-CFG-01), connection
 * through Google's consent page (EF-GML-01), disconnection after confirmation (EF-GML-02).
 */
export function GmailSettings({ initialNotice }: { initialNotice: Notice | null }) {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchGmailStatus(controller.signal)
      .then((gmail) => setState({ status: 'ready', gmail }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'error', message: messageOf(error) });
      });
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
      {state.status === 'ready' && state.gmail.connected && (
        <ConnectedMailbox
          gmail={state.gmail}
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
          <button
            type="button"
            className="btn"
            disabled={isLeaving}
            aria-busy={isLeaving}
            onClick={() => void handleConnect()}
          >
            {isLeaving ? 'Redirection vers Google…' : 'Connecter Gmail'}
          </button>
        </div>
      )}
    </section>
  );
}
