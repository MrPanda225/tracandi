import { type FormEvent, useId, useState } from 'react';
import {
  CHOSEN_OFFER_TEXT_MAX_LENGTH,
  CHOSEN_OFFER_TEXT_MIN_LENGTH,
  CHOSEN_OFFERS_PER_LEVEL,
} from '../../../api/chosenOffers';
import { EXPERIENCE_LEVELS, type ExperienceLevel } from '../../../api/criteria';
import { LEVEL_LABELS } from '../../../lib/experience';
import { formatInteger } from '../../../lib/format';
import { LevelChips } from './LevelChips';
import type { LevelCounts } from './levelCounts';

/** EF-VEI-48: same bounds and words as the API. */
const describeTextRefusal = (text: string): string | null => {
  const length = text.trim().length;
  if (length < CHOSEN_OFFER_TEXT_MIN_LENGTH)
    return 'L’offre semble incomplète : collez le texte entier de l’annonce.';
  if (length > CHOSEN_OFFER_TEXT_MAX_LENGTH) {
    return 'L’offre dépasse 20 000 caractères : gardez l’essentiel de l’annonce.';
  }
  return null;
};

/** EF-VEI-48: the level and the text of an offer; the text is checked when the candidate sends it. */
export function AddOfferForm({
  counts,
  isBusy,
  onAdd,
}: {
  counts: LevelCounts;
  isBusy: boolean;
  onAdd: (level: ExperienceLevel, text: string) => void;
}) {
  const textId = useId();
  const hintId = useId();
  const errorId = useId();
  const levelHintId = useId();
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [text, setText] = useState('');
  const [hasTried, setHasTried] = useState(false);
  const levelProblem = hasTried && level === null ? 'Choisissez le niveau de cette offre.' : null;
  const textProblem = hasTried ? describeTextRefusal(text) : null;
  const isFull = (candidate: ExperienceLevel) => counts[candidate] >= CHOSEN_OFFERS_PER_LEVEL;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setHasTried(true);
    if (level === null || describeTextRefusal(text)) return;
    onAdd(level, text.trim());
  };

  return (
    <form className="watch-form" aria-label="Ajouter une offre" noValidate onSubmit={handleSubmit}>
      <div className="form-field">
        <p className="form-field__label" aria-hidden="true">
          Niveau de l’offre
        </p>
        <LevelChips
          label="Niveau de l’offre"
          value={level}
          isDisabled={isBusy}
          isLevelDisabled={isFull}
          isInvalid={levelProblem !== null}
          describedBy={levelHintId}
          describe={(candidate) =>
            isFull(candidate)
              ? `${LEVEL_LABELS[candidate]} (complet)`
              : `${LEVEL_LABELS[candidate]} (${String(counts[candidate])} sur ${String(CHOSEN_OFFERS_PER_LEVEL)})`
          }
          onChange={setLevel}
        />
        {EXPERIENCE_LEVELS.some(isFull) && (
          <p id={levelHintId} className="form-field__hint">
            Un niveau complet n’est plus proposé : retirez une offre pour en ajouter une autre.
          </p>
        )}
        {levelProblem && <p className="form-field__error">{levelProblem}</p>}
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={textId}>
          Texte de l’offre
        </label>
        <p id={hintId} className="form-field__hint">
          Collez l’annonce entière, de 200 à 20 000 caractères. Le texte n’est pas conservé : seuls
          l’intitulé, les mots-clés et les années demandées le sont.
        </p>
        <textarea
          id={textId}
          className="control"
          rows={8}
          value={text}
          disabled={isBusy}
          aria-invalid={textProblem !== null}
          aria-describedby={textProblem ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => setText(event.target.value)}
        />
        <p className="form-field__hint watch-text-count">
          {formatInteger(text.trim().length)} / {formatInteger(CHOSEN_OFFER_TEXT_MAX_LENGTH)} caractères
        </p>
        {textProblem && (
          <p id={errorId} className="form-field__error">
            {textProblem}
          </p>
        )}
      </div>
      <div>
        <button type="submit" className="btn" disabled={isBusy} aria-busy={isBusy}>
          {isBusy ? 'Lecture de l’offre…' : 'Ajouter cette offre'}
        </button>
      </div>
    </form>
  );
}
