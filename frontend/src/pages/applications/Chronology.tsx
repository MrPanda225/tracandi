import { useEffect, useState } from 'react';
import { type ApplicationEmail, fetchApplicationEmails } from '../../api/applications';
import { isAbortError, messageOf } from '../../api/client';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';
import { DIRECTION_LABELS, EMAIL_CATEGORY_LABELS, formatDateTime } from '../../lib/format';
import './Chronology.css';

const GMAIL_ORIGIN = 'https://mail.google.com';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; emails: ApplicationEmail[] };

// The URL comes from the API: a link is only rendered towards Gmail, never towards another scheme or site.
const isGmailUrl = (url: string): boolean => {
  try {
    return new URL(url).origin === GMAIL_ORIGIN;
  } catch {
    return false;
  }
};

function Message({ email }: { email: ApplicationEmail }) {
  return (
    <li className={`chronology__item chronology__item--${email.direction}`}>
      <p className="chronology__meta">
        <time dateTime={email.receivedAt}>{formatDateTime(email.receivedAt)}</time>
        <span className="chronology__direction">{DIRECTION_LABELS[email.direction]}</span>
        <span className="chronology__category">{EMAIL_CATEGORY_LABELS[email.category]}</span>
      </p>
      {email.subject && <p className="chronology__subject">{email.subject}</p>}
      {email.snippet && <p className="chronology__snippet">{email.snippet}</p>}
      {isGmailUrl(email.gmailUrl) && (
        <a className="chronology__link" href={email.gmailUrl} target="_blank" rel="noopener noreferrer">
          Ouvrir dans Gmail<span className="visually-hidden"> (nouvel onglet)</span>
        </a>
      )}
    </li>
  );
}

/**
 * EF-CAN-04, EF-CAN-05: messages of one application, oldest first as sent by the API, each with a link to its
 * Gmail thread. Loaded when the application is opened.
 */
export function Chronology({ applicationId }: { applicationId: number }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchApplicationEmails(applicationId, controller.signal)
      .then((emails) => setState({ status: 'ready', emails }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'error', message: messageOf(error) });
      });
    return () => controller.abort();
  }, [applicationId]);

  if (state.status === 'loading') {
    return (
      <div className="chronology__loading" role="status" aria-live="polite">
        <span className="visually-hidden">Chargement des messages…</span>
        <Skeleton width="45%" height="0.8rem" />
        <Skeleton width="90%" height="0.8rem" />
      </div>
    );
  }
  if (state.status === 'error') return <Flash>{state.message}</Flash>;
  if (state.emails.length === 0) {
    return <p className="chronology__empty">Aucun message rattaché à cette candidature pour l’instant.</p>;
  }
  return (
    <ol className="chronology" aria-label="Chronologie des messages">
      {state.emails.map((email) => (
        <Message key={email.id} email={email} />
      ))}
    </ol>
  );
}
