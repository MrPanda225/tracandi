import { useEffect, useId, useRef, useState } from 'react';
import type { CvAnalysis, CvContacts, Dimension } from '../../api/cvWorkshop';
import { ADAPTED_CV_ID, AdaptedCvCard, Changes, SkillsToAdd } from './AdaptedCv';

// Heaviest first (RG-23): the order in which the candidate should read them.
const DIMENSION_ORDER: readonly Dimension[] = ['skills', 'experience', 'techStack', 'education'];
const DIMENSION_LABELS: Readonly<Record<Dimension, string>> = {
  skills: 'Compétences',
  experience: 'Expérience',
  techStack: 'Outils et technologies',
  education: 'Formation',
};
// EF-CVX-30: below this, a dimension is to strengthen; from the other bound on, the CV matches well.
const WEAK_BELOW = 50;
const GOOD_FROM = 75;

/** The overall verdict, in words: the score is never read by its colour alone (WCAG 1.4.1). */
const verdictOf = (score: number): { title: string; text: string } => {
  if (score >= GOOD_FROM) return { title: 'Belle correspondance', text: 'Votre CV colle très bien à cette offre.' };
  if (score >= WEAK_BELOW) {
    return {
      title: 'Correspondance partielle',
      text: 'Votre CV colle en partie : quelques ajustements feraient la différence.',
    };
  }
  return { title: 'Correspondance faible', text: 'Il y a de l’écart avec cette offre, et on voit où travailler.' };
};

const CONTACT_ROWS: { label: string; valuesOf: (contacts: CvContacts) => string[] }[] = [
  { label: 'Nom', valuesOf: (contacts) => (contacts.name ? [contacts.name] : []) },
  { label: 'E-mail', valuesOf: (contacts) => contacts.emails },
  { label: 'Téléphone', valuesOf: (contacts) => contacts.phones },
  { label: 'Adresse', valuesOf: (contacts) => (contacts.address ? [contacts.address] : []) },
  { label: 'Liens', valuesOf: (contacts) => contacts.links },
];

/**
 * EF-CVX-24, RG-23: the peak of the journey — one number, one verdict. It takes the focus when the result replaces
 * the form, so that neither the eye nor a screen reader is left at the bottom of the page (WCAG 2.4.3).
 */
function ScoreCard({ score }: { score: number }) {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const verdict = verdictOf(score);
  useEffect(() => sectionRef.current?.focus(), []);
  return (
    <section ref={sectionRef} className="cv-card cv-score" aria-labelledby={titleId} tabIndex={-1}>
      <h2 id={titleId} className="visually-hidden">
        Votre score
      </h2>
      <p className="cv-score__value">
        <span className="cv-score__number">{score}</span>
        <span className="cv-score__scale">/100</span>
      </p>
      <div>
        <p className="cv-score__verdict">{verdict.title}</p>
        <p className="cv-card__lede">{verdict.text}</p>
        {/* On a phone the adapted CV is far below: one tap to reach it. */}
        <a className="cv-score__jump" href={`#${ADAPTED_CV_ID}`}>
          Voir mon CV adapté
        </a>
      </div>
    </section>
  );
}

/** EF-CVX-24, EF-CVX-30: each dimension, its score and why, the weak ones named as such. */
function Dimensions({ analysis }: { analysis: CvAnalysis }) {
  const titleId = useId();
  const { dimensions, weakDimensions } = analysis.diagnosis;
  return (
    <section className="cv-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="cv-card__title">
        Dans le détail
      </h2>
      <ul className="cv-dimensions">
        {DIMENSION_ORDER.map((dimension) => {
          const { score, explanation } = dimensions[dimension];
          const isWeak = weakDimensions.includes(dimension);
          return (
            <li key={dimension} className="cv-dimension">
              <div className="cv-dimension__head">
                <h3 className="cv-dimension__label">{DIMENSION_LABELS[dimension]}</h3>
                {isWeak && <span className="cv-dimension__weak">À renforcer</span>}
                <span className="cv-dimension__score">{score}/100</span>
              </div>
              <meter
                className="cv-dimension__meter"
                min={0}
                max={100}
                low={WEAK_BELOW}
                high={GOOD_FROM}
                optimum={100}
                value={score}
                aria-label={`${DIMENSION_LABELS[dimension]} : ${String(score)} sur 100`}
              />
              {/* ENF-UTI-07: the reason, on demand — the score and the bar already say the essential. */}
              <details className="cv-why">
                <summary className="cv-why__summary">Pourquoi ?</summary>
                <p className="cv-dimension__explanation">{explanation}</p>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** EF-CVX-35, ENF-RGP-07: what the AI received, folded away — there for whoever wants to check. */
function WhatTheAiReceived({ analysis }: { analysis: CvAnalysis }) {
  const { text, contacts, ocrPageCount } = analysis.reading;
  return (
    <details className="cv-card cv-fold cv-received">
      <summary className="cv-fold__summary">
        <span className="cv-fold__label">Ce que l’IA a reçu</span>
        <span className="cv-fold__hint">Votre CV, sans vos coordonnées</span>
      </summary>
      {ocrPageCount > 0 && (
        <p className="cv-card__lede">
          {ocrPageCount > 1 ? `${String(ocrPageCount)} pages ont été lues` : '1 page a été lue'} à partir de l’image
          du scan : jetez un œil au texte, au cas où.
        </p>
      )}
      <h3 className="cv-received__title">Vos coordonnées, gardées pour vous</h3>
      <dl className="cv-contacts">
        {CONTACT_ROWS.map(({ label, valuesOf }) => {
          const values = valuesOf(contacts);
          return (
            <div key={label} className="cv-contacts__row">
              <dt>{label}</dt>
              <dd>{values.length > 0 ? values.join(', ') : <span className="cv-contacts__none">non repéré</span>}</dd>
            </div>
          );
        })}
      </dl>
      <h3 className="cv-received__title">Le texte de votre CV</h3>
      <pre className="cv-text" tabIndex={0}>
        {text}
      </pre>
    </details>
  );
}

/**
 * The result of an analysis: the score and its detail, the missing skills to tick, the adapted CV to download, what
 * changed and why, what the AI received, and what comes next. The score never moves with the ticked skills
 * (EF-CVX-28): it measures the imported CV.
 */
export function DiagnosisResult({
  runId,
  analysis,
  onAnotherOffer,
}: {
  runId: number;
  analysis: CvAnalysis;
  onAnotherOffer: () => void;
}) {
  const [ticked, setTicked] = useState<string[]>([]);
  return (
    <div className="cv-result">
      <ScoreCard score={analysis.diagnosis.overallScore} />
      <SkillsToAdd skills={analysis.diagnosis.missingSkills} ticked={ticked} onTickedChange={setTicked} />
      <Dimensions analysis={analysis} />
      <AdaptedCvCard cv={analysis.adapted.cv} contacts={analysis.reading.contacts} runId={runId} ticked={ticked} />
      <Changes changes={analysis.adapted.changes} />
      <WhatTheAiReceived analysis={analysis} />
      <div className="cv-workshop__end">
        <button type="button" className="btn btn--quiet" onClick={onAnotherOffer}>
          Analyser une autre offre
        </button>
        <p className="cv-workshop__note">Rien n’est gardé : ce résultat s’efface dans 30 minutes.</p>
      </div>
    </div>
  );
}
