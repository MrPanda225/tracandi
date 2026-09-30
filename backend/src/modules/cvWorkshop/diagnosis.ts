import { z } from 'zod';
import { cites, foldText } from './text.js';

/** The four dimensions a CV is scored on against an offer (EF-CVX-24). */
export const DIMENSIONS = ['skills', 'experience', 'education', 'techStack'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

// RG-23, in hundredths so that the sum stays exact.
const WEIGHTS: Readonly<Record<Dimension, number>> = { skills: 40, experience: 30, techStack: 15, education: 15 };
const WEIGHT_TOTAL = 100;
/** EF-CVX-30: a dimension scored below this is a weak point. */
export const WEAK_SCORE_BELOW = 50;
const MAX_SENTENCES = 3;
const EXPLANATION_MAX_LENGTH = 600;
const MISSING_SKILLS_MAX = 20;
const SKILL_MAX_LENGTH = 60;

const sentenceCount = (text: string): number =>
  text.split(/(?<=[.!?…])\s+/u).filter((sentence) => sentence.trim() !== '').length;

const ExplainedScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  explanation: z
    .string()
    .trim()
    .min(1)
    .max(EXPLANATION_MAX_LENGTH)
    .refine((text) => sentenceCount(text) <= MAX_SENTENCES, 'Au plus trois phrases'),
});

/**
 * EF-CVX-24, EF-IA-03: what the `diagnose_cv` task must answer — four sub-scores explained, and the skills the offer
 * asks for that the CV does not cite. Anything else is rejected, and the router tries the next provider.
 */
export const DiagnosisAnswerSchema = z.object({
  skills: ExplainedScoreSchema,
  experience: ExplainedScoreSchema,
  education: ExplainedScoreSchema,
  techStack: ExplainedScoreSchema,
  missingSkills: z.array(z.string().trim().min(1).max(SKILL_MAX_LENGTH)).max(MISSING_SKILLS_MAX),
});
export type DiagnosisAnswer = z.infer<typeof DiagnosisAnswerSchema>;

/** The diagnostic as the candidate sees it. */
export interface Diagnosis {
  /** RG-23, computed here and never by the AI. */
  overallScore: number;
  dimensions: Record<Dimension, { score: number; explanation: string }>;
  /** EF-CVX-30: dimensions scored below 50, in the order of DIMENSIONS. */
  weakDimensions: Dimension[];
  /** EF-CVX-27: skills of the offer the CV really does not cite. */
  missingSkills: string[];
}

/**
 * RG-23: weighted mean of the sub-scores — skills 40 %, experience 30 %, tech stack 15 %, education 15 % —
 * rounded to the nearest integer, so that one diagnostic always gives the same score.
 * @req RG-23
 */
export const overallScore = (answer: Pick<DiagnosisAnswer, Dimension>): number =>
  Math.round(
    DIMENSIONS.reduce((sum, dimension) => sum + answer[dimension].score * WEIGHTS[dimension], 0) / WEIGHT_TOTAL,
  );

/**
 * Turns the answer of the AI into the diagnostic: overall score computed (RG-23), weak dimensions (EF-CVX-30), and the
 * missing skills checked against the CV — one the AI calls missing but the CV cites is dropped, each is kept once.
 * @req EF-CVX-24, EF-CVX-27, EF-CVX-30, RG-23
 */
export const buildDiagnosis = (answer: DiagnosisAnswer, cvText: string): Diagnosis => {
  const foldedCv = foldText(cvText);
  const seen = new Set<string>();
  const missingSkills = answer.missingSkills.filter((skill) => {
    const key = foldText(skill);
    if (seen.has(key) || cites(foldedCv, skill)) return false;
    seen.add(key);
    return true;
  });
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, answer[dimension]]),
  ) as Diagnosis['dimensions'];
  return {
    overallScore: overallScore(answer),
    dimensions,
    weakDimensions: DIMENSIONS.filter((dimension) => answer[dimension].score < WEAK_SCORE_BELOW),
    missingSkills: missingSkills.map((skill) => skill.trim()),
  };
};
