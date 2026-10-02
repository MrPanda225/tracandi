import { type FormEvent, useId, useState } from 'react';
import { ApiError, messageOf } from '../../../api/client';
import {
  CRITERIA_CONTRACT_TYPES,
  type CriteriaContractType,
  validateProfile,
  type WatchCriteria,
} from '../../../api/criteria';
import { Flash } from '../../../components/Flash';
import { LEVEL_LABELS, MAX_YEARS, MIN_YEARS } from '../../../lib/experience';
import { CONTRACT_LABELS, plural } from '../../../lib/format';
import { LevelChips } from './LevelChips';
import {
  type DeductionOfCv,
  doesLevelOverrideYears,
  draftOf,
  hasNoProblem,
  levelOf,
  MAX_OFFER_TYPES,
  type OfferDraft,
  type ProfileDraft,
  profileBodyOf,
  profileProblems,
} from './profileDraft';

function ContractChoices({
  index,
  offer,
  errorId,
  onChange,
}: {
  index: number;
  offer: OfferDraft;
  /** The message that says why no contract is accepted, when it is shown. */
  errorId: string | undefined;
  onChange: (contracts: CriteriaContractType[]) => void;
}) {
  const toggle = (contract: CriteriaContractType) =>
    onChange(
      offer.contractTypes.includes(contract)
        ? offer.contractTypes.filter((kept) => kept !== contract)
        : [...offer.contractTypes, contract],
    );
  return (
    <div
      className="watch-choices"
      role="group"
      aria-label={`Contrats de l’offre type ${String(index + 1)}`}
      aria-describedby={errorId}
    >
      {CRITERIA_CONTRACT_TYPES.map((contract) => (
        <label key={contract} className="watch-choice">
          <input
            type="checkbox"
            checked={offer.contractTypes.includes(contract)}
            disabled={!offer.isKept}
            onChange={() => toggle(contract)}
          />
          {CONTRACT_LABELS[contract]}
        </label>
      ))}
    </div>
  );
}

/** One offer the CV types proposed: kept or not, and, when kept, editable like the targets of the criteria. */
function OfferFields({
  index,
  offer,
  canKeep,
  problems,
  onChange,
}: {
  index: number;
  offer: OfferDraft;
  canKeep: boolean;
  problems: { label: string | null; keywords: string | null; contracts: string | null } | null;
  onChange: (offer: OfferDraft) => void;
}) {
  const labelId = useId();
  const keywordsId = useId();
  const keywordsHintId = useId();
  const contractsErrorId = useId();
  return (
    <fieldset className="watch-offer-type" data-kept={offer.isKept || undefined}>
      <legend>
        Offre type {index + 1} <span className="watch-offer-type__source">d’après « {offer.source} »</span>
      </legend>
      <label className="watch-choice">
        <input
          type="checkbox"
          checked={offer.isKept}
          disabled={!offer.isKept && !canKeep}
          onChange={(event) => onChange({ ...offer, isKept: event.target.checked })}
        />
        Garder cette offre
      </label>
      <div className="form-field">
        <label className="form-field__label" htmlFor={labelId}>
          Métier
        </label>
        <input
          id={labelId}
          className="control"
          value={offer.label}
          disabled={!offer.isKept}
          aria-invalid={Boolean(problems?.label)}
          aria-describedby={problems?.label ? `${labelId}-error` : undefined}
          onChange={(event) => onChange({ ...offer, label: event.target.value })}
        />
        {problems?.label && (
          <p id={`${labelId}-error`} className="form-field__error">
            {problems.label}
          </p>
        )}
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={keywordsId}>
          Mots-clés
        </label>
        <input
          id={keywordsId}
          className="control"
          value={offer.keywords}
          disabled={!offer.isKept}
          aria-invalid={Boolean(problems?.keywords)}
          aria-describedby={problems?.keywords ? `${keywordsHintId} ${keywordsId}-error` : keywordsHintId}
          onChange={(event) => onChange({ ...offer, keywords: event.target.value })}
        />
        <p id={keywordsHintId} className="form-field__hint">
          De 1 à 15, séparés par des virgules : une offre qui n’en contient aucun n’est pas notée.
        </p>
        {problems?.keywords && (
          <p id={`${keywordsId}-error`} className="form-field__error">
            {problems.keywords}
          </p>
        )}
      </div>
      <ContractChoices
        index={index}
        offer={offer}
        errorId={problems?.contracts ? contractsErrorId : undefined}
        onChange={(contractTypes) => onChange({ ...offer, contractTypes })}
      />
      {problems?.contracts && (
        <p id={contractsErrorId} className="form-field__error">
          {problems.contracts}
        </p>
      )}
    </fieldset>
  );
}

/** EF-VEI-47: the years typed as text, so that what is refused (51, 3,5) can be said where it was typed. */
function YearsField({
  years,
  problem,
  sources,
  onChange,
}: {
  years: string;
  problem: string | null;
  sources: readonly DeductionOfCv[];
  onChange: (years: string) => void;
}) {
  const yearsId = useId();
  const hintId = useId();
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={yearsId}>
        Années d’expérience
      </label>
      <input
        id={yearsId}
        className="control watch-years"
        type="number"
        inputMode="numeric"
        min={MIN_YEARS}
        max={MAX_YEARS}
        step={1}
        value={years}
        aria-invalid={problem !== null}
        aria-describedby={problem ? `${hintId} ${yearsId}-error` : hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={hintId} className="form-field__hint">
        Comptées d’après les périodes de vos CV :{' '}
        {sources
          .map(({ cvLabel, deduction }) => `« ${cvLabel} » ${plural(deduction.years, 'an')}`)
          .join(', ')}
        . Corrigez-les si besoin.
      </p>
      {problem && (
        <p id={`${yearsId}-error`} className="form-field__error">
          {problem}
        </p>
      )}
    </div>
  );
}

/** What the candidate is told about the level, live: where it comes from, and what will be kept. */
const describeLevel = (draft: ProfileDraft): string | null => {
  const level = levelOf(draft);
  if (level === null) return null;
  if (doesLevelOverrideYears(draft)) {
    return `Vous avez choisi le niveau ${LEVEL_LABELS[level]}, que vos années ne donnent pas : seul ce niveau sera enregistré, sans les années.`;
  }
  return draft.years.trim() === ''
    ? `Niveau choisi : ${LEVEL_LABELS[level]}.`
    : `Niveau d’après vos années : ${LEVEL_LABELS[level]}.`;
};

interface ValidationFailure {
  message: string;
  details: string[];
}

/**
 * EF-VEI-46, EF-VEI-47: the profile the CV types deduced, to correct and validate. The years are the candidate's to
 * correct and the level follows them live (RG-28); the offers are kept, edited or left, five at most. Nothing is used
 * by the watch before « Valider ce profil ».
 */
export function ProfileForm({
  deductions,
  onValidated,
}: {
  deductions: readonly DeductionOfCv[];
  onValidated: (criteria: WatchCriteria) => void;
}) {
  const levelHintId = useId();
  const [draft, setDraft] = useState(() => draftOf(deductions));
  const [hasTried, setHasTried] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<ValidationFailure | null>(null);
  const problems = profileProblems(draft);
  const keptCount = draft.offers.filter((offer) => offer.isKept).length;
  const levelNote = describeLevel(draft);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setHasTried(true);
    if (!hasNoProblem(problems)) return;
    setIsSaving(true);
    setFailure(null);
    try {
      onValidated(await validateProfile(profileBodyOf(draft)));
    } catch (error) {
      setFailure({
        message: messageOf(error),
        details: error instanceof ApiError ? error.details.map((issue) => issue.message) : [],
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="watch-form"
      aria-label="Profil à valider"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <YearsField
        years={draft.years}
        problem={problems.years}
        sources={deductions}
        onChange={(years) => setDraft({ ...draft, years, manualLevel: null })}
      />
      <div className="form-field">
        <p className="form-field__label" aria-hidden="true">
          Niveau
        </p>
        <LevelChips
          label="Niveau"
          value={levelOf(draft)}
          isDisabled={isSaving}
          isInvalid={hasTried && problems.level !== null}
          describedBy={levelHintId}
          onChange={(level) => setDraft({ ...draft, manualLevel: level })}
        />
        <p id={levelHintId} className="form-field__hint">
          Le niveau suit vos années : junior jusqu’à 2 ans, confirmé de 3 à 7 ans, senior à partir de 8 ans.
        </p>
        {levelNote && (
          <p className="watch-level-note" role="status" aria-live="polite">
            {levelNote}
          </p>
        )}
        {hasTried && problems.level && <p className="form-field__error">{problems.level}</p>}
      </div>

      {draft.offers.map((offer, index) => (
        <OfferFields
          key={offer.key}
          index={index}
          offer={offer}
          canKeep={keptCount < MAX_OFFER_TYPES}
          problems={hasTried ? (problems.perOffer.get(offer.key) ?? null) : null}
          onChange={(changed) =>
            setDraft({
              ...draft,
              offers: draft.offers.map((kept) => (kept.key === offer.key ? changed : kept)),
            })
          }
        />
      ))}
      <p className="gmail-card__hint" role="status" aria-live="polite">
        {plural(keptCount, 'offre gardée', 'offres gardées')} sur {MAX_OFFER_TYPES} au plus.
      </p>
      {hasTried && problems.offers && <p className="form-field__error">{problems.offers}</p>}

      {failure && (
        <>
          <Flash>{failure.message}</Flash>
          {failure.details.length > 0 && (
            <ul className="watch-refusals" aria-label="Champs refusés">
              {failure.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div>
        <button type="submit" className="btn" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? 'Validation…' : 'Valider ce profil'}
        </button>
      </div>
    </form>
  );
}
