import { z } from '../../lib/openapi.js';

/**
 * RG-09: contract types a target accepts. « Autre » and « non précisé » are not choices of the candidate: an offer
 * whose contract is not stated does not lower its score, and one outside these four is not a target.
 */
export const TARGET_CONTRACT_TYPES = ['cdi', 'cdd', 'alternance', 'job_etudiant'] as const;

// Bounds of what a CV can hold: a reference profile is read by a human and by the AI, never a dumping ground.
const SHORT = 200;
const LINE = 500;
const PARAGRAPH = 2000;
const MAX_TARGETS = 20;
const MAX_KEYWORDS = 100;
const MAX_EXPERIENCES = 30;
const MAX_BULLETS = 20;
const MAX_DEGREES = 20;
const MAX_SKILLS = 30;
const MAX_INTERESTS = 20;

const text = (max: number) => z.string().trim().min(1).max(max);
/** A field of the profile that may be left out; an empty or blank answer counts as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/** Coordinates shown in the header of the CV (RG-15: in the body of the document, never in a Word header). */
const IdentitySchema = z.object({
  name: text(SHORT),
  city: text(SHORT),
  phone: text(SHORT),
  email: z.string().trim().email().max(SHORT),
  /** Driving licence, work permit… anything the header should carry besides the coordinates. */
  extra: optionalText(LINE),
});

/** EF-CVX-02, RG-09: a kind of job the candidate looks for, and the contracts it accepts. */
const TargetSchema = z.object({
  label: text(SHORT),
  contractTypes: z.array(z.enum(TARGET_CONTRACT_TYPES)).min(1).max(TARGET_CONTRACT_TYPES.length),
  /** RG-10: an offer is scored when its title or description holds one of these. */
  keywords: z.array(text(SHORT)).min(1).max(MAX_KEYWORDS),
});

/** One job actually held: RG-12 forbids a CV from changing any of these fields. */
const ExperienceSchema = z.object({
  dates: text(SHORT),
  company: text(SHORT),
  place: optionalText(SHORT),
  role: text(SHORT),
  duration: optionalText(SHORT),
  bullets: z.array(text(LINE)).min(1).max(MAX_BULLETS),
});

const EducationSchema = z.object({
  dates: text(SHORT),
  school: text(SHORT),
  place: optionalText(SHORT),
  degree: optionalText(SHORT),
  detail: optionalText(LINE),
});

const SkillSchema = z.object({ label: text(SHORT), value: text(LINE) });

/** The material every generated CV is written from, and nothing else (RG-12). */
const CvSourceSchema = z.object({
  defaultTitle: text(SHORT),
  defaultSubtitle: text(LINE),
  profile: text(PARAGRAPH),
  experiences: z.array(ExperienceSchema).min(1).max(MAX_EXPERIENCES),
  education: z.array(EducationSchema).min(1).max(MAX_DEGREES),
  skills: z.array(SkillSchema).min(1).max(MAX_SKILLS),
  interests: z.array(text(LINE)).max(MAX_INTERESTS),
});

/**
 * EF-CVX-01, EF-CVX-02, Q-16: the reference profile of one candidate, the single source of every CV (RG-12) and of
 * the targets used to score offers (RG-09). Stored as one document per user and validated by this schema on every
 * read and every write, so a profile written outside the application can never reach a CV.
 * @req EF-CVX-01, EF-CVX-02, RG-09, RG-12, Q-16
 */
export const CandidateProfileSchema = z
  .object({
    identity: IdentitySchema,
    location: z.object({ searchArea: text(LINE) }),
    availability: text(LINE),
    targets: z.array(TargetSchema).min(1).max(MAX_TARGETS),
    cvSource: CvSourceSchema,
  })
  .strict()
  .openapi('CandidateProfile');

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
