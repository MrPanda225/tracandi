import { useId, useState } from 'react';
import {
  type CandidateProfile,
  CONTRACT_LABELS,
  STUDY_LEVEL_LABELS,
  STUDY_LEVELS,
  type StudyLevelName,
  type TargetContractType,
  TARGET_CONTRACT_TYPES,
} from '../../api/profile';

/** Une liste saisie une valeur par ligne : c'est plus rapide à corriger qu'une suite de champs. */
const linesOf = (values: readonly string[]): string => values.join('\n');
const valuesOf = (lines: string): string[] =>
  lines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** Un champ facultatif du profil : vide à l'écran, absent dans le document. */
const orNull = (value: string): string | null => (value.trim() === '' ? null : value);

/** EF-CVX-19 : une année saisie ; tout ce qui n'est pas un nombre entier reste absent plutôt que faux. */
const yearOf = (value: string): number | null => {
  const typed = Number.parseInt(value.trim(), 10);
  return value.trim() === '' || Number.isNaN(typed) ? null : typed;
};

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="control"
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="form-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

function LongField({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="control"
        rows={rows}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="form-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Un groupe répétable : ajouter une entrée, retirer celle qu'on ne veut plus. */
function Repeatable<T>({
  legend,
  entries,
  onChange,
  blank,
  render,
  addLabel,
  canBeEmpty = false,
}: {
  legend: string;
  entries: T[];
  onChange: (entries: T[]) => void;
  blank: () => T;
  render: (entry: T, update: (entry: T) => void) => React.ReactNode;
  addLabel: string;
  /** EF-CVX-19 : un groupe que le candidat peut vider entièrement, parce que le profil l'accepte vide. */
  canBeEmpty?: boolean;
}) {
  return (
    <fieldset className="profile-form__group">
      <legend>{legend}</legend>
      {entries.map((entry, index) => (
        <div className="profile-form__entry" key={index}>
          {render(entry, (updated) => onChange(entries.map((one, at) => (at === index ? updated : one))))}
          <button
            type="button"
            className="btn btn--quiet"
            disabled={!canBeEmpty && entries.length === 1}
            onClick={() => onChange(entries.filter((_, at) => at !== index))}
          >
            Retirer
          </button>
        </div>
      ))}
      <button type="button" className="btn btn--quiet" onClick={() => onChange([...entries, blank()])}>
        {addLabel}
      </button>
    </fieldset>
  );
}

/**
 * EF-CVX-18, RG-18 : le niveau le plus élevé atteint, et s'il est obtenu ou en cours. « Non précisé » est un
 * choix à part entière : le CV n'affiche alors aucun niveau.
 */
function StudyLevelField({
  value,
  onChange,
}: {
  value: CandidateProfile['studyLevel'];
  onChange: (value: CandidateProfile['studyLevel']) => void;
}) {
  const id = useId();
  return (
    <>
      <div className="form-field">
        <label className="form-field__label" htmlFor={id}>
          Niveau le plus élevé
        </label>
        <select
          id={id}
          className="control"
          value={value.level ?? ''}
          onChange={(event) =>
            onChange({ ...value, level: (event.target.value || null) as StudyLevelName | null })
          }
        >
          <option value="">Non précisé</option>
          {STUDY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {STUDY_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
      </div>
      <label>
        <input
          type="checkbox"
          checked={value.isInProgress}
          disabled={value.level === null}
          onChange={(event) => onChange({ ...value, isInProgress: event.target.checked })}
        />{' '}
        Ce diplôme est en cours
      </label>
    </>
  );
}

/**
 * EF-CVX-02 : formulaire du profil de référence. Il remplace le profil en entier ; les listes se saisissent une
 * valeur par ligne, et un champ laissé vide est absent du document plutôt que vide.
 */
export function ProfileForm({
  profile,
  isSaving,
  onSave,
  onCancel,
}: {
  profile: CandidateProfile;
  isSaving: boolean;
  onSave: (profile: CandidateProfile) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const { identity, cvSource } = draft;
  const setCv = (changes: Partial<CandidateProfile['cvSource']>) =>
    setDraft({ ...draft, cvSource: { ...cvSource, ...changes } });

  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset className="profile-form__group">
        <legend>Identité</legend>
        <Field
          label="Nom"
          value={identity.name}
          onChange={(name) => setDraft({ ...draft, identity: { ...identity, name } })}
        />
        <Field
          label="Ville"
          value={identity.city}
          onChange={(city) => setDraft({ ...draft, identity: { ...identity, city } })}
        />
        <Field
          label="Téléphone"
          value={identity.phone}
          onChange={(phone) => setDraft({ ...draft, identity: { ...identity, phone } })}
        />
        <Field
          label="Adresse e-mail"
          value={identity.email}
          onChange={(email) => setDraft({ ...draft, identity: { ...identity, email } })}
        />
        <Field
          label="Complément"
          hint="Permis, autorisation de travail… affiché dans l’en-tête du CV."
          value={identity.extra ?? ''}
          onChange={(extra) => setDraft({ ...draft, identity: { ...identity, extra: orNull(extra) } })}
        />
      </fieldset>

      <fieldset className="profile-form__group">
        <legend>Recherche</legend>
        <LongField
          label="Zone de recherche"
          rows={2}
          value={draft.location.searchArea}
          onChange={(searchArea) => setDraft({ ...draft, location: { searchArea } })}
        />
        <LongField
          label="Disponibilités"
          rows={2}
          hint="Affichées à droite de l’en-tête du CV."
          value={draft.availability}
          onChange={(availability) => setDraft({ ...draft, availability })}
        />
      </fieldset>

      <fieldset className="profile-form__group">
        <legend>Niveau d’études</legend>
        <StudyLevelField
          value={draft.studyLevel}
          onChange={(studyLevel) => setDraft({ ...draft, studyLevel })}
        />
      </fieldset>

      <Repeatable
        legend="Cibles"
        addLabel="Ajouter une cible"
        entries={draft.targets}
        onChange={(targets) => setDraft({ ...draft, targets })}
        blank={() => ({ label: '', contractTypes: ['cdi' as TargetContractType], keywords: [] })}
        render={(target, update) => (
          <>
            <Field label="Libellé" value={target.label} onChange={(label) => update({ ...target, label })} />
            <div className="form-field">
              <span className="form-field__label">Types de contrat acceptés</span>
              <div className="profile-form__checks">
                {TARGET_CONTRACT_TYPES.map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={target.contractTypes.includes(type)}
                      onChange={(event) =>
                        update({
                          ...target,
                          contractTypes: event.target.checked
                            ? [...target.contractTypes, type]
                            : target.contractTypes.filter((kept) => kept !== type),
                        })
                      }
                    />
                    {CONTRACT_LABELS[type]}
                  </label>
                ))}
              </div>
            </div>
            <LongField
              label="Mots-clés"
              hint="Un par ligne : une offre est notée si son intitulé ou sa description en contient un."
              value={linesOf(target.keywords)}
              onChange={(lines) => update({ ...target, keywords: valuesOf(lines) })}
            />
          </>
        )}
      />

      <fieldset className="profile-form__group">
        <legend>CV</legend>
        <Field
          label="Titre par défaut"
          value={cvSource.defaultTitle}
          onChange={(defaultTitle) => setCv({ defaultTitle })}
        />
        <Field
          label="Sous-titre"
          value={cvSource.defaultSubtitle}
          onChange={(defaultSubtitle) => setCv({ defaultSubtitle })}
        />
        <LongField label="Profil" rows={5} value={cvSource.profile} onChange={(profile) => setCv({ profile })} />
      </fieldset>

      <Repeatable
        legend="Expériences professionnelles"
        addLabel="Ajouter une expérience"
        entries={cvSource.experiences}
        onChange={(experiences) => setCv({ experiences })}
        blank={() => ({ dates: '', company: '', place: null, role: '', duration: null, bullets: [] })}
        render={(experience, update) => (
          <>
            <Field
              label="Dates"
              hint="Telles qu’elles sont vraies ; le CV les écrit en MM/AAAA."
              value={experience.dates}
              onChange={(dates) => update({ ...experience, dates })}
            />
            <Field
              label="Entreprise"
              value={experience.company}
              onChange={(company) => update({ ...experience, company })}
            />
            <Field label="Poste" value={experience.role} onChange={(role) => update({ ...experience, role })} />
            <Field
              label="Lieu"
              value={experience.place ?? ''}
              onChange={(place) => update({ ...experience, place: orNull(place) })}
            />
            <Field
              label="Durée"
              value={experience.duration ?? ''}
              onChange={(duration) => update({ ...experience, duration: orNull(duration) })}
            />
            <LongField
              label="Ce que vous y avez fait"
              hint="Une activité par ligne."
              value={linesOf(experience.bullets)}
              onChange={(lines) => update({ ...experience, bullets: valuesOf(lines) })}
            />
          </>
        )}
      />

      <Repeatable
        legend="Formation"
        addLabel="Ajouter une formation"
        entries={cvSource.education}
        onChange={(education) => setCv({ education })}
        blank={() => ({ dates: '', school: '', place: null, degree: null, detail: null })}
        render={(degree, update) => (
          <>
            <Field label="Dates" value={degree.dates} onChange={(dates) => update({ ...degree, dates })} />
            <Field
              label="Établissement"
              value={degree.school}
              onChange={(school) => update({ ...degree, school })}
            />
            <Field
              label="Diplôme"
              value={degree.degree ?? ''}
              onChange={(value) => update({ ...degree, degree: orNull(value) })}
            />
            <Field
              label="Lieu"
              value={degree.place ?? ''}
              onChange={(place) => update({ ...degree, place: orNull(place) })}
            />
            <Field
              label="Précision"
              value={degree.detail ?? ''}
              onChange={(detail) => update({ ...degree, detail: orNull(detail) })}
            />
          </>
        )}
      />

      <Repeatable
        legend="Compétences"
        addLabel="Ajouter une compétence"
        entries={cvSource.skills}
        onChange={(skills) => setCv({ skills })}
        blank={() => ({ label: '', value: '' })}
        render={(skill, update) => (
          <>
            <Field label="Intitulé" value={skill.label} onChange={(label) => update({ ...skill, label })} />
            <LongField
              label="Détail"
              rows={2}
              value={skill.value}
              onChange={(value) => update({ ...skill, value })}
            />
          </>
        )}
      />

      <Repeatable
        legend="Certifications"
        addLabel="Ajouter une certification"
        canBeEmpty
        entries={cvSource.certifications}
        onChange={(certifications) => setCv({ certifications })}
        blank={() => ({ name: '', issuer: null, year: null })}
        render={(certification, update) => (
          <>
            <Field
              label="Intitulé"
              value={certification.name}
              onChange={(name) => update({ ...certification, name })}
            />
            <Field
              label="Organisme"
              value={certification.issuer ?? ''}
              onChange={(issuer) => update({ ...certification, issuer: orNull(issuer) })}
            />
            <Field
              label="Année"
              hint="Laissez vide si vous préférez ne pas la faire figurer."
              value={certification.year === null ? '' : String(certification.year)}
              onChange={(year) => update({ ...certification, year: yearOf(year) })}
            />
          </>
        )}
      />

      <fieldset className="profile-form__group">
        <legend>Centres d’intérêt</legend>
        <LongField
          label="Centres d’intérêt"
          hint="Un par ligne ; laissez vide pour ne pas afficher la section."
          value={linesOf(cvSource.interests)}
          onChange={(lines) => setCv({ interests: valuesOf(lines) })}
        />
      </fieldset>

      <div className="profile-form__actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer le profil'}
        </button>
      </div>
    </form>
  );
}
