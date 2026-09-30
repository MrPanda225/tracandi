import { useEffect, useId, useState } from 'react';
import { type ApplicationEmail, fetchApplicationEmails } from '../../api/applications';
import { isAbortError, messageOf } from '../../api/client';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';
import { DIRECTION_LABELS, EMAIL_CATEGORY_LABELS, formatDate, formatDateTime } from '../../lib/format';
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

/** The inside of a thumbnail: when, which way, what kind, the subject, one line of the message. */
function MessageSummary({ email }: { email: ApplicationEmail }) {
  return (
    <>
      <span className="message-card__meta">
        <time dateTime={email.receivedAt} title={formatDateTime(email.receivedAt)}>
          {formatDate(email.receivedAt)}
        </time>
        <span className="message-card__direction">{DIRECTION_LABELS[email.direction]}</span>
      </span>
      <span className="message-card__category">{EMAIL_CATEGORY_LABELS[email.category]}</span>
      {email.subject && <span className="message-card__subject">{email.subject}</span>}
      {email.snippet && <span className="message-card__snippet">{email.snippet}</span>}
    </>
  );
}

/** One message as a thumbnail; the whole card opens its thread in Gmail when the link is a Gmail one. */
function Message({ email }: { email: ApplicationEmail }) {
  return (
    <li className={`message-card message-card--${email.direction}`}>
      {isGmailUrl(email.gmailUrl) ? (
        <a className="message-card__body" href={email.gmailUrl} target="_blank" rel="noopener noreferrer">
          <MessageSummary email={email} />
          <span className="visually-hidden">Ouvrir dans Gmail (nouvel onglet)</span>
        </a>
      ) : (
        <div className="message-card__body">
          <MessageSummary email={email} />
        </div>
      )}
    </li>
  );
}

/**
 * EF-CAN-04, EF-CAN-05: messages of one application as thumbnails, oldest first as sent by the API, each opening
 * its Gmail thread: little text, so that the list is seen at a glance rather than read. Loaded when the application
 * is opened.
 */
export function Chronology({ applicationId }: { applicationId: number }) {
  const titleId = useId();
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
  return (
    <section className="chronology-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="detail-title">
        Messages <span className="detail-title__count">{state.emails.length}</span>
      </h3>
      {state.emails.length === 0 ? (
        <p className="chronology__empty">Aucun message pour l’instant.</p>
      ) : (
        <ol className="chronology" aria-label="Chronologie des messages">
          {state.emails.map((email) => (
            <Message key={email.id} email={email} />
          ))}
        </ol>
      )}
    </section>
  );
}
