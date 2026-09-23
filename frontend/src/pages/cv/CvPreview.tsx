import { useEffect, useRef, useState, type ReactNode } from 'react';
import { STUDY_LEVEL_LABELS, type CandidateProfile } from '../../api/profile';
import './CvPreview.css';

/** RG-15 : titres de sections usuels, dans l'ordre où un recruteur les attend. */
const SECTION_TITLES = {
  profile: 'PROFIL',
  experiences: 'EXPÉRIENCES PROFESSIONNELLES',
  education: 'FORMATION',
  skills: 'COMPÉTENCES',
  certifications: 'CERTIFICATIONS',
  interests: 'CENTRES D’INTÉRÊT',
} as const;

/** Un bandeau de section : fond `#D9E2F3` bordé `#AAB5CE`, libellé en majuscules (RG-11). */
const Section = ({ title }: { title: string }) => <p className="cv-sheet__section">{title}</p>;

/** Une ligne « dates | contenu », alignée sur la tabulation de la charte (RG-11). */
const DatedLine = ({ dates, children }: { dates: string; children: ReactNode }) => (
  <p className="cv-sheet__dated">
    <span className="cv-sheet__dates">{dates}</span>
    <span>{children}</span>
  </p>
);

const joined = (parts: readonly (string | null | undefined)[], separator = ', '): string =>
  parts.filter((part): part is string => Boolean(part && part.trim() !== '')).join(separator);

/** RG-11 : coordonnées à gauche, disponibilités à droite ; l'emplacement de la photo reste vide (Q-01). */
function Header({ profile }: { profile: CandidateProfile }) {
  const { identity } = profile;
  const left = [identity.name, identity.city, identity.phone, identity.email, identity.extra].filter(
    (line): line is string => line !== null && line !== '',
  );
  const right = profile.availability.split(';').map((part) => part.trim());
  const lines = Math.max(left.length, right.length);

  return (
    <div className="cv-sheet__header">
      {Array.from({ length: lines }, (_item, index) => (
        <p className="cv-sheet__header-line" key={index}>
          <span className={index === 0 ? 'cv-sheet__name' : undefined}>{left[index] ?? ''}</span>
          <span className="cv-sheet__availability">{right[index] ?? ''}</span>
        </p>
      ))}
    </div>
  );
}

function Experiences({ experiences }: { experiences: CandidateProfile['cvSource']['experiences'] }) {
  return (
    <>
      {experiences.map((experience) => (
        <div className="cv-sheet__entry" key={`${experience.company}-${experience.dates}`}>
          <DatedLine dates={experience.dates}>
            <strong>{experience.role}</strong>
            {` — ${experience.company}`}
            {joined([experience.place, experience.duration]) &&
              ` (${joined([experience.place, experience.duration])})`}
          </DatedLine>
          {experience.bullets.map((bullet) => (
            <p className="cv-sheet__bullet" key={bullet}>
              {bullet}
            </p>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Le CV tel qu'il sera écrit dans le document Word : A4, une colonne, une page, avec la charte du candidat
 * (RG-11) et les titres de sections que lisent les logiciels de recrutement (RG-15).
 *
 * Ce n'est pas une illustration : les proportions, la tabulation des dates, les bandeaux et les tailles viennent
 * des mêmes constantes que le rendu `.docx`, pour que ce que le candidat voit soit ce qu'il enverra (EF-CVX-08).
 * @req EF-CVX-01, EF-CVX-08, RG-11, RG-15
 */
export function CvPreview({ profile }: { profile: CandidateProfile }) {
  const { cvSource, studyLevel } = profile;
  const sheet = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = sheet.current;
    if (!element) return undefined;
    // RG-11 : le CV tient sur une page. Mieux vaut le dire au candidat que de le lui laisser découvrir.
    const measure = () => setIsOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [profile]);

  return (
    <div className="cv-preview">
      {isOverflowing && (
        <p className="cv-preview__warning" role="status">
          Le contenu dépasse une page. Raccourcissez le profil ou les activités décrites : la charte du CV tient
          sur une seule page (RG-11).
        </p>
      )}

      <div className="cv-sheet" ref={sheet} aria-label="Aperçu du CV" role="region">
        <Header profile={profile} />

        <p className="cv-sheet__title">{cvSource.defaultTitle}</p>
        <p className="cv-sheet__subtitle">{cvSource.defaultSubtitle}</p>

        <Section title={SECTION_TITLES.profile} />
        <p className="cv-sheet__paragraph">{cvSource.profile}</p>

        <Section title={SECTION_TITLES.experiences} />
        <Experiences experiences={cvSource.experiences} />

        <Section title={SECTION_TITLES.education} />
        {cvSource.education.map((degree) => (
          <DatedLine dates={degree.dates} key={`${degree.school}-${degree.dates}`}>
            <strong>{degree.degree ?? degree.school}</strong>
            {joined([degree.degree ? degree.school : null, degree.place, degree.detail], ' — ') &&
              ` — ${joined([degree.degree ? degree.school : null, degree.place, degree.detail], ' — ')}`}
          </DatedLine>
        ))}
        {studyLevel.level !== null && (
          <p className="cv-sheet__paragraph">
            <strong>Niveau d’études : </strong>
            {STUDY_LEVEL_LABELS[studyLevel.level]}
            {studyLevel.isInProgress && ' (en cours)'}
          </p>
        )}

        <Section title={SECTION_TITLES.skills} />
        {cvSource.skills.map((skill) => (
          <DatedLine dates={skill.label} key={skill.label}>
            {skill.value}
          </DatedLine>
        ))}

        {cvSource.certifications.length > 0 && (
          <>
            <Section title={SECTION_TITLES.certifications} />
            {cvSource.certifications.map((certification) => (
              <DatedLine dates={certification.year === null ? '' : String(certification.year)} key={certification.name}>
                <strong>{certification.name}</strong>
                {certification.issuer !== null && ` — ${certification.issuer}`}
              </DatedLine>
            ))}
          </>
        )}

        {cvSource.interests.length > 0 && (
          <>
            <Section title={SECTION_TITLES.interests} />
            {cvSource.interests.map((interest) => (
              <p className="cv-sheet__bullet" key={interest}>
                {interest}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
