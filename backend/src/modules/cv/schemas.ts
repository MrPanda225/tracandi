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
const MAX_CERTIFICATIONS = 20;
/** Bounds of a certification year: old enough for any candidate, never a date in a far future. */
const FIRST_CERTIFICATION_YEAR = 1950;
const LAST_CERTIFICATION_YEAR = 2100;

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
export const IdentitySchema = z.object({
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
export const ExperienceSchema = z.object({
  dates: text(SHORT),
  company: text(SHORT),
  place: optionalText(SHORT),
  role: text(SHORT),
  duration: optionalText(SHORT),
  bullets: z.array(text(LINE)).min(1).max(MAX_BULLETS),
});

export const EducationSchema = z.object({
  dates: text(SHORT),
  school: text(SHORT),
  place: optionalText(SHORT),
  degree: optionalText(SHORT),
  detail: optionalText(LINE),
});

export const SkillSchema = z.object({ label: text(SHORT), value: text(LINE) });

/**
 * RG-18: levels of study, from the lowest to the highest. The order is the one of the list, so a comparison
 * between two levels is their position in it.
 */
export const STUDY_LEVELS = ['bac', 'bac_2', 'bac_3', 'bac_5', 'doctorat', 'autre'] as const;

/**
 * EF-CVX-18, RG-18: the highest level of study reached, obtained or under way. A profile written before this
 * field existed declares none, and stays readable: an absent level is « non précisé », never a guess.
 */
/** What a profile that declares no level of study reads as (EF-CVX-18). */
export const NO_STUDY_LEVEL = { level: null, isInProgress: false } as const;

export const StudyLevelSchema = z
  .object({
    level: z.enum(STUDY_LEVELS).nullish().default(null),
    isInProgress: z.boolean().nullish().default(false),
  })
  .transform((value) => ({ level: value.level ?? null, isInProgress: value.isInProgress ?? false }));

/** RG-18: how each level is written on the CV and on the screen (ENF-UTI-01). */
export const STUDY_LEVEL_LABELS: Readonly<Record<(typeof STUDY_LEVELS)[number], string>> = {
  bac: 'Bac',
  bac_2: 'Bac+2 (BTS, DUT, BUT 2)',
  bac_3: 'Bac+3 (licence, bachelor, BUT 3)',
  bac_5: 'Bac+5 (master, diplôme d’ingénieur)',
  doctorat: 'Doctorat',
  autre: 'Autre',
};

/** EF-CVX-19: a certification the candidate holds. The issuer and the year are optional; the name is not. */
export const CertificationSchema = z.object({
  name: text(SHORT),
  issuer: optionalText(SHORT),
  year: z
    .number()
    .int()
    .min(FIRST_CERTIFICATION_YEAR)
    .max(LAST_CERTIFICATION_YEAR)
    .nullish()
    .transform((value) => value ?? null),
});

/** The material every generated CV is written from, and nothing else (RG-12). */
const CvSourceSchema = z.object({
  defaultTitle: text(SHORT),
  defaultSubtitle: text(LINE),
  profile: text(PARAGRAPH),
  experiences: z.array(ExperienceSchema).min(1).max(MAX_EXPERIENCES),
  education: z.array(EducationSchema).min(1).max(MAX_DEGREES),
  skills: z.array(SkillSchema).min(1).max(MAX_SKILLS),
  interests: z.array(text(LINE)).max(MAX_INTERESTS),
  // EF-CVX-19: absent from a profile written before v1.12, which must keep opening (EF-CVX-01).
  certifications: z
    .array(CertificationSchema)
    .max(MAX_CERTIFICATIONS)
    .nullish()
    .transform((value) => value ?? []),
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
    // EF-CVX-18: optional, so that every profile written before v1.12 stays readable.
    studyLevel: StudyLevelSchema.nullish().transform((value) => value ?? NO_STUDY_LEVEL),
    targets: z.array(TargetSchema).min(1).max(MAX_TARGETS),
    cvSource: CvSourceSchema,
  })
  .strict()
  .openapi('CandidateProfile');

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

/**
 * EF-CVX-06, EF-CVX-08: what one CV holds once it is written — the reference profile reordered and reworded for an
 * offer (T-504), or the profile as it stands. The rendering draws this and nothing else, so a CV can never show
 * anything the schema does not carry.
 * @req EF-CVX-06, EF-CVX-08, EF-CVX-14, RG-11, RG-15
 */
export const CvContentSchema = z
  .object({
    identity: IdentitySchema,
    /** RG-11: right side of the header, beside the coordinates. */
    availability: text(LINE),
    /** RG-15: the job title targeted by the offer. */
    title: text(SHORT),
    subtitle: text(LINE),
    profile: text(PARAGRAPH),
    experiences: z.array(ExperienceSchema).min(1).max(MAX_EXPERIENCES),
    education: z.array(EducationSchema).min(1).max(MAX_DEGREES),
    // EF-CVX-20: written under the FORMATION section when the profile states one.
    studyLevel: StudyLevelSchema.nullish().transform((value) => value ?? NO_STUDY_LEVEL),
    skills: z.array(SkillSchema).min(1).max(MAX_SKILLS),
    // EF-CVX-20: a section of its own, and no section at all when the candidate holds none.
    certifications: z
    .array(CertificationSchema)
    .max(MAX_CERTIFICATIONS)
    .nullish()
    .transform((value) => value ?? []),
    interests: z.array(text(LINE)).max(MAX_INTERESTS),
  })
  .strict()
  .openapi('CvContent');

export type CvContent = z.infer<typeof CvContentSchema>;
