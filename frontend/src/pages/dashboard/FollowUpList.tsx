import { useId, useState } from 'react';
import { prepareFollowUpDraft } from '../../api/applications';
import { messageOf } from '../../api/client';
import type { FollowUp } from '../../api/stats';
import { openPendingTab } from '../../lib/browser';
import { StatusTag } from '../../components/StatusTag';
import { plural } from '../../lib/format';
import './FollowUpList.css';

interface FollowUpListProps {
  total: number;
  items: readonly FollowUp[];
  followUpDays: number;
}

/** « il y a N jours » — Kairos: the number that should trigger the relaunch, not just a date. */
const sinceLabel = (days: number): string => (days === 0 ? "aujourd'hui" : `il y a ${plural(days, 'jour')}`);

type DraftState =
  | { status: 'idle' }
  | { status: 'writing' }
  | { status: 'ready'; draftUrl: string; to: string }
  | { status: 'failed'; message: string };

/**
 * EF-CAN-17: « Relancer » has the AI write the follow-up and saves it as a Gmail draft in the thread; Gmail opens on
 * it, in the tab opened by the click. Nothing is sent: the candidate reads, then sends from Gmail.
 */
function FollowUpAction({ item }: { item: FollowUp }) {
  const [state, setState] = useState<DraftState>({ status: 'idle' });
  const isWriting = state.status === 'writing';

  const handleFollowUp = async () => {
    const tab = openPendingTab();
    setState({ status: 'writing' });
    try {
      const draft = await prepareFollowUpDraft(item.id);
      tab.go(draft.draftUrl);
      setState({ status: 'ready', draftUrl: draft.draftUrl, to: draft.to });
    } catch (failure) {
      tab.close();
      setState({ status: 'failed', message: messageOf(failure) });
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn--quiet follow-ups__button"
        disabled={isWriting}
        aria-busy={isWriting}
        aria-label={`Relancer ${item.company} — ${item.jobTitle}`}
        onClick={() => void handleFollowUp()}
      >
        {isWriting ? 'Rédaction…' : 'Relancer'}
      </button>
      {state.status === 'ready' && (
        <p className="follow-ups__draft" role="status">
          Brouillon prêt pour {state.to}.{' '}
          <a href={state.draftUrl} target="_blank" rel="noopener noreferrer">
            Ouvrir le brouillon
          </a>
        </p>
      )}
      {state.status === 'failed' && (
        <p className="follow-ups__draft follow-ups__draft--failed" role="alert">
          {state.message}
        </p>
      )}
    </>
  );
}

/**
 * EF-TDB-07: applications waiting since more than `followUpDays` with a contact to write to (RG-06), oldest
 * activity first, each with its follow-up draft (EF-CAN-17).
 * Loss-aversion framing (ux-design, Cialdini): the day count makes the cost of waiting concrete.
 */
export function FollowUpList({ total, items, followUpDays }: FollowUpListProps) {
  const titleId = useId();
  return (
    <section className="follow-ups" aria-labelledby={titleId}>
      <div className="follow-ups__header">
        <h2 id={titleId} className="follow-ups__title">
          À relancer
        </h2>
        {total > 0 && <span className="follow-ups__count">{total}</span>}
      </div>
      <p className="follow-ups__hint">
        Envoyée ou Accusé reçu depuis plus de {plural(followUpDays, 'jour')} sans nouvelle activité, avec une
        adresse à qui écrire. « Relancer » prépare le mail en brouillon dans Gmail : vous le relisez, puis l’envoyez.
      </p>

      {items.length === 0 ? (
        <p className="follow-ups__empty">Rien à relancer pour l’instant : c’est à jour.</p>
      ) : (
        <ul className="follow-ups__list">
          {items.map((item) => (
            <li key={item.id} className="follow-ups__item">
              <div className="follow-ups__item-main">
                <p className="follow-ups__company">{item.company}</p>
                <p className="follow-ups__job">{item.jobTitle}</p>
              </div>
              <div className="follow-ups__item-meta">
                <StatusTag status={item.status} />
                <span className="follow-ups__since">{sinceLabel(item.daysSinceActivity)}</span>
              </div>
              <FollowUpAction item={item} />
            </li>
          ))}
        </ul>
      )}
      {total > items.length && (
        <p className="follow-ups__more">et {plural(total - items.length, 'autre')}.</p>
      )}
    </section>
  );
}
