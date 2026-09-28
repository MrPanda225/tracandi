import { useId, useState } from 'react';
import { messageOf } from '../../api/client';
import { type AdaptedCv, type CvChange, downloadAdaptedCv } from '../../api/cvWorkshop';
import { Flash } from '../../components/Flash';
import { saveFile } from '../../lib/browser';

/** The skills of the CV, then those ticked, each once — as the Word file will list them (EF-CVX-28). */
const withTicked = (skills: readonly string[], ticked: readonly string[]): string[] => {
  const seen = new Set<string>();
  return [...skills, ...ticked].filter((skill) => {
    const key = skill.toLocaleLowerCase('fr');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * EF-CVX-27, EF-CVX-28: what the offer asks for and the CV does not say, each to tick when the candidate truly has it.
 * Nothing is added without their say.
 */
export function SkillsToAdd({
  skills,
  ticked,
  onTickedChange,
}: {
  skills: readonly string[];
  ticked: readonly string[];
  onTickedChange: (ticked: string[]) => void;
}) {
  const titleId = useId();
  const toggle = (skill: string) =>
    onTickedChange(ticked.includes(skill) ? ticked.filter((item) => item !== skill) : [...ticked, skill]);
  return (
    <section className="cv-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="cv-card__title">
        Ce que l’offre demande et que votre CV ne dit pas
      </h2>
      {skills.length > 0 ? (
        <fieldset className="cv-skills-fieldset">
          <legend className="cv-card__lede">
            Vous en maîtrisez vraiment certaines ? Cochez-les : on les ajoute à vos compétences.
          </legend>
          <ul className="cv-skills">
            {skills.map((skill) => (
              <li key={skill}>
                <label className="cv-skills__item cv-skills__choice">
                  <input type="checkbox" checked={ticked.includes(skill)} onChange={() => toggle(skill)} />
                  {skill}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <p className="cv-card__lede">Rien d’important ne manque. Bravo !</p>
      )}
    </section>
  );
}

/** EF-CVX-25: the adapted CV, section by section, as the Word file will read. */
function CvPreview({ cv, ticked }: { cv: AdaptedCv; ticked: readonly string[] }) {
  const skills = withTicked(cv.skills, ticked);
  const lists: [string, readonly string[]][] = [
    ['Compétences', skills],
    ['Certifications', cv.certifications],
    ['Langues', cv.languages],
    ['Centres d’intérêt', cv.interests],
  ];
  return (
    <article className="cv-preview" aria-label="Aperçu de votre CV adapté">
      <p className="cv-preview__headline">{cv.headline}</p>
      {cv.profile && (
        <>
          <h3 className="cv-preview__section">Profil</h3>
          <p>{cv.profile}</p>
        </>
      )}
      {cv.experiences.length > 0 && <h3 className="cv-preview__section">Expériences professionnelles</h3>}
      {cv.experiences.map((experience) => (
        <div key={`${experience.organization}-${experience.dates}`} className="cv-preview__entry">
          <p className="cv-preview__entry-title">
            {experience.title} — {experience.organization}
            {experience.place ? `, ${experience.place}` : ''}
          </p>
          <p className="cv-preview__dates">{experience.dates}</p>
          <ul>
            {experience.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      ))}
      {cv.education.length > 0 && <h3 className="cv-preview__section">Formation</h3>}
      {cv.education.map((entry) => (
        <div key={`${entry.school}-${entry.dates}`} className="cv-preview__entry">
          <p className="cv-preview__entry-title">
            {entry.degree} — {entry.school}
            {entry.place ? `, ${entry.place}` : ''}
          </p>
          <p className="cv-preview__dates">{entry.dates}</p>
          {entry.detail && <p>{entry.detail}</p>}
        </div>
      ))}
      {lists
        .filter(([, values]) => values.length > 0)
        .map(([title, values]) => (
          <div key={title}>
            <h3 className="cv-preview__section">{title}</h3>
            <p>{values.join(', ')}</p>
          </div>
        ))}
    </article>
  );
}

/** EF-CVX-31: the Word file, with the ticked skills; the button waits while it is prepared (ENF-UTI-03). */
function DownloadAction({ runId, ticked }: { runId: number; ticked: readonly string[] }) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsPreparing(true);
    setFailure(null);
    try {
      saveFile(await downloadAdaptedCv(runId, ticked));
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div className="cv-download">
      <button type="button" className="btn" disabled={isPreparing} onClick={() => void handleDownload()}>
        {isPreparing ? 'Préparation…' : 'Télécharger mon CV (Word)'}
      </button>
      <p className="form-field__hint">
        Vos coordonnées sont remises en tête du fichier. Une colonne, des rubriques standards : les logiciels de
        recrutement le lisent sans peine.
      </p>
      {failure && <Flash>{failure}</Flash>}
    </div>
  );
}

/** EF-CVX-25, EF-CVX-31: the adapted CV and the way to take it away. */
export function AdaptedCvCard({ cv, runId, ticked }: { cv: AdaptedCv; runId: number; ticked: readonly string[] }) {
  const titleId = useId();
  return (
    <section className="cv-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="cv-card__title">
        Votre CV, adapté à cette offre
      </h2>
      <p className="cv-card__lede">Rien n’a été inventé : tout vient de votre CV, dit avec les mots de l’offre.</p>
      <CvPreview cv={cv} ticked={ticked} />
      <DownloadAction runId={runId} ticked={ticked} />
    </section>
  );
}

/** EF-CVX-29: each change, what it was, what it became, and why it serves this offer. */
export function Changes({ changes }: { changes: readonly CvChange[] }) {
  const titleId = useId();
  if (changes.length === 0) return null;
  return (
    <section className="cv-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="cv-card__title">
        Ce qui a changé, et pourquoi
      </h2>
      <ol className="cv-changes">
        {changes.map((change, index) => (
          <li key={`${String(index)}-${change.section}`} className="cv-change">
            <p className="cv-change__section">{change.section}</p>
            <dl className="cv-change__texts">
              {change.before && (
                <div className="cv-change__before">
                  <dt>Avant</dt>
                  <dd>{change.before}</dd>
                </div>
              )}
              <div className="cv-change__after">
                <dt>Après</dt>
                <dd>{change.after}</dd>
              </div>
            </dl>
            <p className="cv-change__reason">{change.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
