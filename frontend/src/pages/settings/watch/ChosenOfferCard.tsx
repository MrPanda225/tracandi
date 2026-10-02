import { type FormEvent, useId, useState } from 'react';
import { messageOf } from '../../../api/client';
import {
  CHOSEN_OFFERS_PER_LEVEL,
  type ChosenOffer,
  type ChosenOfferCorrection,
  correctChosenOffer,
  deleteChosenOffer,
} from '../../../api/chosenOffers';
import type { ExperienceLevel } from '../../../api/criteria';
import { Flash } from '../../../components/Flash';
import { LEVEL_LABELS, parseYears } from '../../../lib/experience';
import { plural } from '../../../lib/format';
import type { Notice } from '../GmailSettings';
import { describeKeywordsProblem, describeLabelProblem, keywordsOf } from './fields';
import { LevelChips } from './LevelChips';
import type { LevelCounts } from './levelCounts';

const NO_YEARS_PROBLEM = 'Indiquez les années demandées, ou cochez « L’offre n’en précise pas ».';

/** EF-VEI-49: why the years typed are refused — none are asked for when the offer demands none. */
const describeYearsProblem = (years: string, hasNoYears: boolean): string | null => {
  if (hasNoYears) return null;
  const reading = parseYears(years);
  if ('problem' in reading) return reading.problem;
  return reading.years === null ? NO_YEARS_PROBLEM : null;
};

/** EF-VEI-49: what the candidate changed of the traits, and only that — the API takes a partial correction. */
const correctionOf = (
  offer: ChosenOffer,
  edited: { title: string; keywords: string[]; years: number | null; level: ExperienceLevel },
): ChosenOfferCorrection => ({
  ...(edited.title !== offer.title ? { title: edited.title } : {}),
  ...(edited.keywords.join('\n') !== offer.keywords.join('\n') ? { keywords: edited.keywords } : {}),
  ...(edited.years !== offer.years ? { years: edited.years } : {}),
  ...(edited.level !== offer.level ? { level: edited.level } : {}),
});

/** EF-VEI-49: the traits of an offer to correct — the title, the keywords, the years it demands (or none), the level. */
function TraitsForm({
  offer,
  counts,
  onSaved,
  onCancel,
}: {
  offer: ChosenOffer;
  counts: LevelCounts;
  onSaved: (updated: ChosenOffer) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const keywordsId = useId();
  const yearsId = useId();
  const [title, setTitle] = useState(offer.title);
  const [keywords, setKeywords] = useState(offer.keywords.join(', '));
  const [years, setYears] = useState(offer.years === null ? '' : String(offer.years));
  const [hasNoYears, setHasNoYears] = useState(offer.years === null);
  const [level, setLevel] = useState(offer.level);
  const [hasTried, setHasTried] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const keywordList = keywordsOf(keywords);
  const yearsReading = parseYears(years);
  const problems = {
    title: describeLabelProblem(title),
    keywords: describeKeywordsProblem(keywordList),
    years: describeYearsProblem(years, hasNoYears),
  };
  const hasProblem = Object.values(problems).some((problem) => problem !== null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setHasTried(true);
    if (hasProblem) return;
    const correction = correctionOf(offer, {
      title: title.trim(),
      keywords: keywordList,
      years: hasNoYears || 'problem' in yearsReading ? null : yearsReading.years,
      level,
    });
    if (Object.keys(correction).length === 0) {
      onCancel();
      return;
    }
    setIsSaving(true);
    setFailure(null);
    try {
      onSaved(await correctChosenOffer(offer.id, correction));
    } catch (error) {
      setFailure(messageOf(error));
      setIsSaving(false);
    }
  };

  return (
    <form
      className="watch-form"
      aria-label={`Corriger les traits de ${offer.title}`}
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="form-field">
        <label className="form-field__label" htmlFor={titleId}>
          Intitulé
        </label>
        <input
          id={titleId}
          className="control"
          value={title}
          disabled={isSaving}
          aria-invalid={hasTried && problems.title !== null}
          onChange={(event) => setTitle(event.target.value)}
        />
        {hasTried && problems.title && <p className="form-field__error">{problems.title}</p>}
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={keywordsId}>
          Mots-clés
        </label>
        <input
          id={keywordsId}
          className="control"
          value={keywords}
          disabled={isSaving}
          aria-invalid={hasTried && problems.keywords !== null}
          aria-describedby={`${keywordsId}-hint`}
          onChange={(event) => setKeywords(event.target.value)}
        />
        <p id={`${keywordsId}-hint`} className="form-field__hint">
          De 1 à 15, séparés par des virgules.
        </p>
        {hasTried && problems.keywords && <p className="form-field__error">{problems.keywords}</p>}
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={yearsId}>
          Années demandées
        </label>
        <input
          id={yearsId}
          className="control watch-years"
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          step={1}
          value={years}
          disabled={isSaving || hasNoYears}
          aria-invalid={hasTried && problems.years !== null}
          onChange={(event) => setYears(event.target.value)}
        />
        <label className="watch-choice">
          <input
            type="checkbox"
            checked={hasNoYears}
            disabled={isSaving}
            onChange={(event) => setHasNoYears(event.target.checked)}
          />
          L’offre n’en précise pas
        </label>
        {(hasTried || 'problem' in yearsReading) && problems.years && (
          <p className="form-field__error">{problems.years}</p>
        )}
      </div>
      <div className="form-field">
        <p className="form-field__label" aria-hidden="true">
          Niveau pour lequel cette offre sert de modèle
        </p>
        <LevelChips
          label="Niveau pour lequel cette offre sert de modèle"
          value={level}
          isDisabled={isSaving}
          isLevelDisabled={(candidate) =>
            candidate !== offer.level && counts[candidate] >= CHOSEN_OFFERS_PER_LEVEL
          }
          onChange={setLevel}
        />
      </div>
      {failure && <Flash>{failure}</Flash>}
      <div className="gmail-card__buttons">
        <button type="button" className="btn btn--quiet" disabled={isSaving} onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

/** EF-VEI-48: removing an offer asks again, since its text is gone and cannot be read a second time. */
function ConfirmRemoval({
  offer,
  onRemoved,
  onCancel,
}: {
  offer: ChosenOffer;
  onRemoved: () => void;
  onCancel: () => void;
}) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handleRemove = async () => {
    setIsRemoving(true);
    setFailure(null);
    try {
      await deleteChosenOffer(offer.id);
      onRemoved();
    } catch (error) {
      setFailure(messageOf(error));
      setIsRemoving(false);
    }
  };

  return (
    <div className="watch-confirm">
      <p className="gmail-card__hint">
        Retirer cette offre l’enlève de vos modèles. Son texte n’étant pas conservé, il faudra la coller de
        nouveau pour la rajouter.
      </p>
      {failure && <Flash>{failure}</Flash>}
      <div className="gmail-card__buttons">
        <button type="button" className="btn btn--quiet" disabled={isRemoving} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={isRemoving}
          aria-busy={isRemoving}
          onClick={() => void handleRemove()}
        >
          {isRemoving ? 'Retrait…' : 'Confirmer le retrait'}
        </button>
      </div>
    </div>
  );
}

type OfferMode = 'view' | 'edit' | 'remove';

/** EF-VEI-49: an offer as it is kept — its traits, never its text — to correct or to remove. */
export function ChosenOfferCard({
  offer,
  counts,
  onChange,
}: {
  offer: ChosenOffer;
  counts: LevelCounts;
  onChange: (notice: Notice) => void;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<OfferMode>('view');
  return (
    <article className="watch-offer" aria-labelledby={titleId}>
      <strong id={titleId}>{offer.title}</strong>
      <ul className="watch-keywords" aria-label={`Mots-clés de ${offer.title}`}>
        {offer.keywords.map((keyword) => (
          <li key={keyword}>{keyword}</li>
        ))}
      </ul>
      <p className="gmail-card__hint">
        Années demandées : {offer.years === null ? 'non précisée' : plural(offer.years, 'an')}
      </p>
      <p className="gmail-card__hint">
        Niveau suggéré : {offer.suggestedLevel ? LEVEL_LABELS[offer.suggestedLevel] : 'non déterminé'}
      </p>
      {mode === 'view' && (
        <div className="watch-item__actions">
          <button
            type="button"
            className="btn btn--quiet btn--small"
            aria-label={`Corriger les traits de ${offer.title}`}
            onClick={() => setMode('edit')}
          >
            Corriger
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--small btn--quiet-danger"
            aria-label={`Retirer l’offre ${offer.title}`}
            onClick={() => setMode('remove')}
          >
            Retirer
          </button>
        </div>
      )}
      {mode === 'edit' && (
        <TraitsForm
          offer={offer}
          counts={counts}
          onCancel={() => setMode('view')}
          onSaved={(updated) => {
            setMode('view');
            onChange({ tone: 'success', text: `Les traits de « ${updated.title} » sont corrigés.` });
          }}
        />
      )}
      {mode === 'remove' && (
        <ConfirmRemoval
          offer={offer}
          onCancel={() => setMode('view')}
          onRemoved={() =>
            onChange({ tone: 'success', text: `« ${offer.title} » est retirée de vos offres choisies.` })
          }
        />
      )}
    </article>
  );
}
