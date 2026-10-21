import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { messageOf } from '../../api/client';
import { type AdaptedCv, type CvChange, type CvContacts, downloadAdaptedCv } from '../../api/cvWorkshop';
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
            Cochez celles que vous maîtrisez vraiment : elles rejoignent votre CV.
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

// « Langages : Python, SQL », « Anglais : courant »: a heading and what it groups, shown side by side like a CV does.
const splitHeading = (item: string): [string, string] | null => {
  const at = item.indexOf(':');
  if (at <= 0) return null;
  const heading = item.slice(0, at).trim();
  const rest = item.slice(at + 1).trim();
  return heading && rest ? [heading, rest] : null;
};

/** A list of the CV: grouped lines as rows of a heading and its items, the other items on one line. */
function CvList({ items }: { items: readonly string[] }) {
  const rows = items.map(splitHeading).filter((row) => row !== null);
  const plain = items.filter((item) => splitHeading(item) === null);
  return (
    <>
      {rows.length > 0 && (
        <dl className="cv-sheet__rows">
          {rows.map(([heading, rest]) => (
            <div key={heading} className="cv-sheet__row">
              <dt>{heading}</dt>
              <dd>{rest}</dd>
            </div>
          ))}
        </dl>
      )}
      {plain.length > 0 && <p>{plain.join(', ')}</p>}
    </>
  );
}

/** One experience or degree: its dates in the margin, then what, where, and its detail. */
function CvEntry({
  dates,
  what,
  organization,
  place,
  children,
}: {
  dates: string | null;
  what: string;
  organization: string | null;
  place: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="cv-sheet__entry">
      <p className="cv-sheet__dates">{dates}</p>
      <div className="cv-sheet__body">
        <div className="cv-sheet__entry-head">
          <p className="cv-sheet__role">
            {what}
            {organization && (
              <>
                {' '}
                — <span className="cv-sheet__organization">{organization}</span>
              </>
            )}
          </p>
          {place && <p className="cv-sheet__place">{place}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function CvSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cv-sheet__section">
      <h3 className="cv-sheet__title">{title}</h3>
      {children}
    </section>
  );
}

// EF-CVX-38: the page of the preview is an A4 sheet, 21 × 29.7 cm, like the Word file.
const A4_RATIO = 297 / 210;
// The Word file goes from 11 down to 10 pt (RG-24); the preview, with its margin of dates, may need a little more.
const MIN_SCALE = 0.8;
const SCALE_STEP = 0.02;

/**
 * EF-CVX-38: shrinks the text of the preview, step by step, until it holds in the height of an A4 page of its width.
 * Everything inside the page is sized from its width, so the result holds at any screen size.
 */
const fitOnePage = (sheet: HTMLElement): void => {
  let scale = 1;
  sheet.style.setProperty('--cv-scale', String(scale));
  while (sheet.scrollHeight > sheet.offsetWidth * A4_RATIO && scale > MIN_SCALE) {
    scale -= SCALE_STEP;
    sheet.style.setProperty('--cv-scale', scale.toFixed(2));
  }
};

/**
 * EF-CVX-25: the adapted CV laid out as a sheet, contact details back at the top as in the Word file. The Word file
 * keeps its single column for recruiting software (RG-22); only this page is laid out for the eye.
 */
function CvPreview({
  cv,
  contacts,
  ticked,
}: {
  cv: AdaptedCv;
  contacts: CvContacts;
  ticked: readonly string[];
}) {
  const lists: [string, readonly string[]][] = [
    ['Compétences', withTicked(cv.skills, ticked)],
    ['Certifications', cv.certifications],
    ['Langues', cv.languages],
    ['Centres d’intérêt', cv.interests],
  ];
  const reach = [contacts.address, ...contacts.phones, ...contacts.emails].filter((value) => value !== null);
  const sheetRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    fitOnePage(sheet);
    // The font of the page may arrive after the first layout: measure again once it is there, where the browser says.
    if ('fonts' in document) void document.fonts.ready.then(() => fitOnePage(sheet));
  }, [cv, ticked]);
  return (
    <div className="cv-page">
      <article ref={sheetRef} className="cv-sheet" aria-label="Aperçu de votre CV adapté">
        <header className="cv-sheet__header">
          <p className="cv-sheet__name">
            {contacts.name && <>{contacts.name}, </>}
            <span className="cv-sheet__headline">{cv.headline}</span>
          </p>
          {reach.length > 0 && <p className="cv-sheet__reach">{reach.join(' · ')}</p>}
          {contacts.links.length > 0 && <p className="cv-sheet__reach">{contacts.links.join(' · ')}</p>}
        </header>
        {cv.profile && (
          <CvSection title="Profil">
            <p>{cv.profile}</p>
          </CvSection>
        )}
        {cv.experiences.length > 0 && (
          <CvSection title="Expériences professionnelles">
            {cv.experiences.map((experience) => (
              <CvEntry
                key={`${experience.title}-${experience.organization ?? ''}-${experience.dates ?? ''}`}
                dates={experience.dates}
                what={experience.title}
                organization={experience.organization}
                place={experience.place}
              >
                <ul>
                  {experience.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </CvEntry>
            ))}
          </CvSection>
        )}
        {cv.education.length > 0 && (
          <CvSection title="Formation">
            {cv.education.map((entry) => (
              <CvEntry
                key={`${entry.degree}-${entry.school ?? ''}-${entry.dates ?? ''}`}
                dates={entry.dates}
                what={entry.degree}
                organization={entry.school}
                place={entry.place}
              >
                {entry.detail && <p>{entry.detail}</p>}
              </CvEntry>
            ))}
          </CvSection>
        )}
        {lists
          .filter(([, values]) => values.length > 0)
          .map(([title, values]) => (
            <CvSection key={title} title={title}>
              <CvList items={values} />
            </CvSection>
          ))}
      </article>
    </div>
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
      <p className="form-field__hint">Une page A4, lisible par les logiciels de recrutement.</p>
      {failure && <Flash>{failure}</Flash>}
    </div>
  );
}

/** Anchor of the adapted CV, reached from the score on a phone. */
export const ADAPTED_CV_ID = 'cv-adapte';

/** EF-CVX-25, EF-CVX-31: the adapted CV and, first, the way to take it away — the action the journey leads to. */
export function AdaptedCvCard({
  cv,
  contacts,
  runId,
  ticked,
}: {
  cv: AdaptedCv;
  contacts: CvContacts;
  runId: number;
  ticked: readonly string[];
}) {
  const titleId = useId();
  return (
    <section id={ADAPTED_CV_ID} className="cv-card cv-card--cv" aria-labelledby={titleId}>
      <h2 id={titleId} className="cv-card__title">
        Votre CV, adapté à cette offre
      </h2>
      <p className="cv-card__lede">Rien n’a été inventé : tout vient de votre CV.</p>
      <DownloadAction runId={runId} ticked={ticked} />
      <CvPreview cv={cv} contacts={contacts} ticked={ticked} />
    </section>
  );
}

/** EF-CVX-29, ENF-UTI-07: each change, what it was, what it became and why — folded, opened on demand. */
export function Changes({ changes }: { changes: readonly CvChange[] }) {
  if (changes.length === 0) return null;
  return (
    <details className="cv-card cv-fold">
      <summary className="cv-fold__summary">
        <span className="cv-fold__label">Ce qui a changé, et pourquoi</span>
        <span className="cv-fold__hint">
          {changes.length > 1 ? `${String(changes.length)} modifications` : '1 modification'}
        </span>
      </summary>
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
    </details>
  );
}
