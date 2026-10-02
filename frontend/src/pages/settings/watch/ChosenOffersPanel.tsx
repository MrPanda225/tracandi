import { useId, useState } from 'react';
import { messageOf } from '../../../api/client';
import {
  CHOSEN_OFFERS_PER_LEVEL,
  type ChosenOffer,
  type ChosenOfferList,
  chooseOffer,
  fetchChosenOffers,
} from '../../../api/chosenOffers';
import { EXPERIENCE_LEVELS, type ExperienceLevel } from '../../../api/criteria';
import { Flash } from '../../../components/Flash';
import { LEVEL_LABELS } from '../../../lib/experience';
import { plural } from '../../../lib/format';
import type { Notice } from '../GmailSettings';
import { AddOfferForm } from './AddOfferForm';
import { ChosenOfferCard } from './ChosenOfferCard';
import { countsOf, type LevelCounts } from './levelCounts';
import { LoadFailure, PanelLoading, WatchSection } from './SectionParts';
import { useResource } from './useResource';
import { type FollowedRun, isOngoing, useRunFollower } from './useRunFollower';

const READING_FAILED = 'La lecture de l’offre n’a pas abouti. Réessayez dans un instant.';

/** The offers of one level, and how many of the three places they take. */
function LevelSection({
  level,
  offers,
  counts,
  onChange,
}: {
  level: ExperienceLevel;
  offers: readonly ChosenOffer[];
  counts: LevelCounts;
  onChange: (notice: Notice) => void;
}) {
  const titleId = useId();
  return (
    <section className="watch-level" aria-labelledby={titleId}>
      <div className="watch-level__header">
        <h4 id={titleId} className="watch-level__title">
          {LEVEL_LABELS[level]}
        </h4>
        <p className="gmail-card__hint">
          {plural(offers.length, 'offre')} sur {CHOSEN_OFFERS_PER_LEVEL}
        </p>
      </div>
      {offers.length === 0 ? (
        <p className="gmail-card__hint">Aucune offre pour ce niveau.</p>
      ) : (
        <ul className="watch-items">
          {offers.map((offer) => (
            <li key={offer.id} className="watch-item">
              <ChosenOfferCard offer={offer} counts={counts} onChange={onChange} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** EF-VEI-48: where the reading of the offer stands, in words (ENF-UTI-03). */
function ReadingProgress({ run }: { run: FollowedRun }) {
  return (
    <div
      className="watch-progress"
      role="status"
      aria-live="polite"
      aria-label="Avancement de la lecture de l’offre"
    >
      <p className="gmail-card__hint">
        {run.outcome === 'queued'
          ? 'Lecture de l’offre en attente de son tour…'
          : 'Lecture de l’offre en cours : cela peut prendre quelques minutes, vous pouvez rester sur cette page.'}
      </p>
    </div>
  );
}

/**
 * EF-VEI-48 to EF-VEI-50: up to three offers for each level, chosen by pasting their text. The text is read in the
 * queue and thrown away: what is kept, and shown here for correction, is the title, the keywords, the years the offer
 * demands and the level they point to. The notation of the offers uses them as models (EF-VEI-50).
 */
export function ChosenOffersPanel() {
  const { resource, reload } = useResource(fetchChosenOffers);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adding, setAdding] = useState<ExperienceLevel | null>(null);
  const [formKey, setFormKey] = useState(0);

  const handleRunEnd = async (run: FollowedRun) => {
    const level = adding;
    setAdding(null);
    if (run.outcome !== 'success') {
      setNotice({ tone: 'error', text: run.error ?? READING_FAILED });
      return;
    }
    const where = level === null ? '' : ` au niveau ${LEVEL_LABELS[level]}`;
    setNotice({
      tone: 'success',
      text: `Offre ajoutée${where} : vérifiez les traits retenus et corrigez-les si besoin.`,
    });
    setFormKey((key) => key + 1);
    await reload();
  };

  const { followed, follow } = useRunFollower((run) => void handleRunEnd(run));

  /** The text goes to the API and nowhere else; the answer is the run to follow, or the reason it was refused. */
  const handleAdd = async (level: ExperienceLevel, text: string) => {
    setAdding(level);
    setNotice(null);
    try {
      follow((await chooseOffer(level, text)).runId);
    } catch (error) {
      setAdding(null);
      setNotice({ tone: 'error', text: messageOf(error) });
    }
  };

  const handleChange = (changed: Notice) => {
    setNotice(changed);
    void reload();
  };

  const list: ChosenOfferList | null = resource.status === 'ready' ? resource.value : null;
  const counts = countsOf(list?.items ?? []);

  return (
    <WatchSection title="Offres choisies par niveau">
      <p className="gmail-card__hint">
        Pour chaque niveau, jusqu’à {CHOSEN_OFFERS_PER_LEVEL} offres qui vous ressemblent. Tracandi en retient
        l’intitulé, les mots-clés et les années demandées, et s’en sert pour noter les offres de votre niveau.
        Le texte collé n’est jamais conservé.
      </p>
      {resource.status === 'loading' && <PanelLoading label="Chargement de vos offres choisies…" />}
      {resource.status === 'error' && (
        <LoadFailure message={resource.message} onRetry={() => void reload()} />
      )}
      {notice && <Flash tone={notice.tone}>{notice.text}</Flash>}
      {list && (
        <>
          <div className="watch-levels">
            {EXPERIENCE_LEVELS.map((level) => (
              <LevelSection
                key={level}
                level={level}
                offers={list.items.filter((offer) => offer.level === level)}
                counts={counts}
                onChange={handleChange}
              />
            ))}
          </div>
          {followed && isOngoing(followed) && <ReadingProgress run={followed} />}
          <AddOfferForm
            key={formKey}
            counts={counts}
            isBusy={adding !== null}
            onAdd={(level, text) => void handleAdd(level, text)}
          />
        </>
      )}
    </WatchSection>
  );
}
