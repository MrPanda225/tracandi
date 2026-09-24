import { type ReactNode, useEffect, useId, useState } from 'react';
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
type ConnectedGmail = Extract<GmailStatus, { connected: true }>;

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

/** EF-GML-20 : ce qu'une relecture a fait, en mots. */
const describeReclassification = ({ counters }: RunState) =>
  `${countOf(counters['messages_read'] ?? 0, 'message relu', 'messages relus')}, ` +
  `${countOf(counters['messages_corrected'] ?? 0, 'corrigé', 'corrigés')} en refus`;

/** EF-CFG-05: the state of the mailbox as a word next to its dot — the colour alone never tells it (WCAG 1.4.1). */
function ConnectionBadge({ gmail, run }: { gmail: ConnectedGmail; run: RunState | null }) {
  const [tone, label] = gmail.authorizationExpired
    ? (['expired', 'Autorisation expirée'] as const)
    : isRunning(run)
      ? (['running', 'Synchronisation en cours'] as const)
      : (['ok', 'Connectée'] as const);
  return (
    <span className={`gmail-badge gmail-badge--${tone}`}>
      <span className="gmail-badge__dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

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
      className="btn gmail-card__primary"
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

/**
 * EF-GML-17: writing of Gmail labels, on by default. A switch, because the change applies at once (HIG, MD3); it
 * goes back if the API refuses the change.
 */
function LabelsSwitch({ isOn, onFailure }: { isOn: boolean; onFailure: (message: string) => void }) {
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
    <div className="gmail-card__setting">
      <label className="gmail-card__setting-row">
        <span className="gmail-card__setting-label">Ranger les fils avec des libellés Gmail</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={isChecked}
          disabled={isSaving}
          aria-describedby={hintId}
          onChange={(event) => void handleChange(event.target.checked)}
        />
      </label>
      <p id={hintId} className="gmail-card__hint">
        « Candidatures/‹Entreprise› », « Statut/… » et « Alertes emploi ». Désactivé, Tracandi lit votre boîte sans
        rien y modifier.
      </p>
    </div>
  );
}

/** EF-CFG-04: periods offered for the first synchronisation; the API accepts 1 to 365 days. */
const LOOKBACK_CHOICES = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '1 mois' },
  { days: 90, label: '3 mois' },
  { days: 180, label: '6 mois' },
  { days: 365, label: '1 an' },
];
const PERIOD_LABEL = 'Période de la première synchronisation';

/**
 * EF-CFG-04: period read on the first synchronisation (N of EF-GML-05), as visible choices — five options call for
 * chips, not a menu (MD3). Offered only until the first synchronisation (EF-CFG-05); goes back if the API refuses.
 */
function LookbackChoice({ days, onFailure }: { days: number; onFailure: (message: string) => void }) {
  const hintId = useId();
  const name = useId();
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
    <div className="gmail-card__setting">
      <p className="gmail-card__setting-label" aria-hidden="true">
        {PERIOD_LABEL}
      </p>
      <div className="chips" role="radiogroup" aria-label={PERIOD_LABEL} aria-describedby={hintId}>
        {choices.map((choice) => (
          <label key={choice.days} className="chip">
            <input
              type="radio"
              name={name}
              value={choice.days}
              checked={selected === choice.days}
              disabled={isSaving}
              onChange={() => void handleChange(choice.days)}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
      <p id={hintId} className="gmail-card__hint">
        Messages lus lors de la première synchronisation. Une période courte évite les limites de l’API Gmail.
      </p>
    </div>
  );
}

/**
 * EF-GML-20 : relit dans Gmail les messages déjà classés « accusé de réception » et corrige ceux qui refusent en
 * fait la candidature ; retrouve l'adresse de contact des messages anciens (RG-20). Mise en file comme une
 * synchronisation ; l'avancement arrive par le flux (EF-EXE-04).
 */
function ReclassifyAction({
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
    <div className="gmail-card__setting">
      <p id={hintId} className="gmail-card__hint">
        Corrige en « Refusée » les messages « En attente » qui annonçaient en fait un refus, et retrouve l’adresse à
        qui écrire des anciens messages, nécessaire pour les relancer.
      </p>
      {isRunning(run) && (
        <p className="gmail-card__hint" role="status" aria-live="polite">
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

/** EF-GML-02: disconnection, apart from every other action and behind a confirmation (HIG: destructive actions). */
function DisconnectAction({
  onDisconnected,
  onFailure,
}: {
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
    <div className="gmail-card__setting">
      <p className="gmail-card__hint">
        {isConfirming
          ? 'Tracandi n’aura plus accès à votre boîte et le jeton sera révoqué chez Google.'
          : 'Tracandi n’aura plus accès à votre boîte ; vos candidatures restent enregistrées.'}
      </p>
      <div className="gmail-card__buttons">
        {isConfirming ? (
          <>
            <button type="button" className="btn btn--quiet" onClick={() => setIsConfirming(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={isDisconnecting}
              aria-busy={isDisconnecting}
              onClick={() => void handleDisconnect()}
            >
              {isDisconnecting ? 'Déconnexion…' : 'Confirmer la déconnexion'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--quiet btn--quiet-danger" onClick={() => setIsConfirming(true)}>
            Déconnecter Gmail
          </button>
        )}
      </div>
    </div>
  );
}

/** A titled part of the card (Gestalt proximity); a region, so that assistive technologies list it. */
function CardSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="gmail-card__section" aria-labelledby={titleId}>
      <h3 id={titleId} className="gmail-card__section-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

interface ConnectedMailboxProps {
  gmail: ConnectedGmail;
  run: RunState | null;
  reclassifyRun: RunState | null;
  onQueued: () => void;
  onDisconnected: () => void;
  onFailure: (message: string) => void;
}

/** EF-CFG-05: the address, the last synchronisation and the one action the candidate comes for (Pareto, Fitts). */
function MailboxStatus({ gmail, run, onQueued, onFailure }: Omit<ConnectedMailboxProps, 'reclassifyRun' | 'onDisconnected'>) {
  return (
    <div className="gmail-card__status">
      <div className="gmail-card__identity">
        <p className="gmail-card__address">{gmail.emailAddress}</p>
        <p className="gmail-card__hint">
          {gmail.lastRunAt
            ? `Dernière synchronisation : ${formatDateTime(gmail.lastRunAt)}`
            : 'Dernière synchronisation : pas encore'}
        </p>
        <p className="gmail-card__hint">Connectée depuis le {formatDate(gmail.connectedAt)}</p>
      </div>
      {!gmail.authorizationExpired && <SynchroniseButton run={run} onQueued={onQueued} onFailure={onFailure} />}
      {isRunning(run) && (
        // EF-EXE-03 : ce que la passe en cours a déjà fait, rafraîchi par le flux.
        <p className="gmail-card__progress" role="status" aria-live="polite">
          {run?.outcome === 'queued'
            ? 'Synchronisation en attente de son tour…'
            : `Synchronisation en cours : ${describeCounters(run as RunState)}…`}
        </p>
      )}
      {gmail.lastRunAt && !gmail.lastSyncAt && (
        // EF-GML-06: passes are bounded, so a first synchronisation over a long period takes several of them.
        <p className="gmail-card__progress">
          Rattrapage en cours : les messages les plus récents sont traités d’abord. Relancez jusqu’à ce que le compte
          de messages lus tombe à zéro.
        </p>
      )}
    </div>
  );
}

/**
 * EF-CFG-05: the state and the synchronisation first, then the preferences, the upkeep, and the disconnection
 * last, apart from the rest.
 */
function ConnectedMailbox(props: ConnectedMailboxProps) {
  const { gmail, reclassifyRun, onQueued, onDisconnected, onFailure } = props;
  return (
    <>
      <MailboxStatus {...props} />
      <CardSection title="Préférences">
        <LabelsSwitch isOn={gmail.applyLabels} onFailure={onFailure} />
        {gmail.lastSyncAt !== null ? (
          <p className="gmail-card__hint">Première synchronisation faite : seuls les nouveaux messages sont lus.</p>
        ) : (
          <LookbackChoice days={gmail.lookbackDays} onFailure={onFailure} />
        )}
      </CardSection>
      {!gmail.authorizationExpired && (
        <CardSection title="Entretien">
          <ReclassifyAction run={reclassifyRun} onQueued={onQueued} onFailure={onFailure} />
        </CardSection>
      )}
      <CardSection title="Connexion">
        <DisconnectAction onDisconnected={onDisconnected} onFailure={onFailure} />
      </CardSection>
    </>
  );
}

/** Height of the sections of a connected mailbox: preferences, maintenance, connection. */
const SKELETON_SECTIONS = ['7.5rem', '5.75rem', '4.5rem'];

/**
 * Waiting state shaped like a connected mailbox, the usual case: the block of the address, then its three sections.
 * The cards below already stand where they will stay, instead of being pushed down when the status arrives
 * (ENF-PERF-07, layout shift).
 */
function GmailCardSkeleton() {
  return (
    <div className="gmail-card__loading" role="status" aria-live="polite">
      <span className="visually-hidden">Chargement de la connexion Gmail…</span>
      <Skeleton width="100%" height="6.5rem" />
      {SKELETON_SECTIONS.map((height) => (
        <div key={height} className="gmail-card__section">
          <Skeleton width="25%" height="0.8rem" />
          <Skeleton width="100%" height={height} />
        </div>
      ))}
    </div>
  );
}

/**
 * Gmail card of the settings (EF-CFG-05): state of the mailbox and manual synchronisation (EF-CFG-01, EF-GML-04),
 * labels (EF-GML-17), period of the first synchronisation while it has not happened (EF-CFG-04), reading again the
 * acknowledgements (EF-GML-20), disconnection after confirmation (EF-GML-02), connection and reconnection through
 * Google's consent page (EF-GML-01, Q-11).
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

  const gmail = state.status === 'ready' ? state.gmail : null;

  return (
    <section className="settings-card gmail-card" aria-labelledby={titleId}>
      <header className="gmail-card__header">
        <h2 id={titleId} className="settings-card__title">
          Boîte Gmail
        </h2>
        {gmail?.connected && <ConnectionBadge gmail={gmail} run={run} />}
      </header>
      <p className="settings-card__lede">
        Tracandi lit vos e-mails de candidature pour suivre chaque démarche. Il ne supprime ni n’envoie jamais de
        message.
      </p>
      {notice && <Flash tone={notice.tone}>{notice.text}</Flash>}

      {state.status === 'loading' && <GmailCardSkeleton />}
      {state.status === 'error' && <Flash>{state.message}</Flash>}
      {gmail?.connected && gmail.authorizationExpired && (
        <div className="gmail-card__expired">
          <Flash>
            L’autorisation Gmail a expiré : la synchronisation est en pause. Google la limite à 7 jours tant que le
            projet est en mode test ; reconnectez Gmail pour la reprendre.
          </Flash>
          <ConnectButton label="Reconnecter Gmail" isLeaving={isLeaving} onConnect={() => void handleConnect()} />
        </div>
      )}
      {gmail?.connected && (
        <ConnectedMailbox
          gmail={gmail}
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
      {gmail && !gmail.connected && (
        <div className="gmail-card__empty">
          <p className="gmail-card__hint">
            Aucune boîte connectée. Connectez Gmail pour que vos candidatures se suivent toutes seules.
          </p>
          <ConnectButton label="Connecter Gmail" isLeaving={isLeaving} onConnect={() => void handleConnect()} />
        </div>
      )}
    </section>
  );
}
