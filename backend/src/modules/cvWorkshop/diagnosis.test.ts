import { describe, expect, it } from 'vitest';
import { buildDiagnosis, DiagnosisAnswerSchema, overallScore, WEAK_SCORE_BELOW } from './diagnosis.js';

const explained = (score: number) => ({ score, explanation: 'Votre CV montre deux ans de tableaux de bord.' });
const ANSWER = {
  skills: explained(80),
  experience: explained(60),
  education: explained(90),
  techStack: explained(40),
  missingSkills: ['dbt', 'Power BI', 'Airflow'],
};

describe('overallScore (RG-23)', () => {
  it('[RG-23] weighs skills 40 %, experience 30 %, tech stack and education 15 % each, rounded', () => {
    // 0.4 × 80 + 0.3 × 60 + 0.15 × 40 + 0.15 × 90 = 32 + 18 + 6 + 13.5 = 69.5
    expect(overallScore(ANSWER)).toBe(70);
  });

  it('[RG-23] gives 0 and 100 at the ends', () => {
    const all = (score: number) => ({ ...ANSWER, skills: explained(score), experience: explained(score), education: explained(score), techStack: explained(score) });
    expect(overallScore(all(0))).toBe(0);
    expect(overallScore(all(100))).toBe(100);
  });
});

describe('DiagnosisAnswerSchema', () => {
  it('[EF-CVX-24] accepts four sub-scores explained in one to three sentences', () => {
    expect(DiagnosisAnswerSchema.safeParse(ANSWER).success).toBe(true);
  });

  it('[EF-CVX-24] [EF-IA-03] rejects a sub-score outside 0 to 100, or not an integer', () => {
    for (const score of [-1, 101, 72.5]) {
      expect(DiagnosisAnswerSchema.safeParse({ ...ANSWER, skills: explained(score) }).success, String(score)).toBe(false);
    }
  });

  it('[EF-CVX-24] rejects an explanation of more than three sentences, or an empty one', () => {
    const tooLong = { score: 50, explanation: 'Un. Deux. Trois. Quatre.' };
    expect(DiagnosisAnswerSchema.safeParse({ ...ANSWER, experience: tooLong }).success).toBe(false);
    expect(DiagnosisAnswerSchema.safeParse({ ...ANSWER, experience: { score: 50, explanation: ' ' } }).success).toBe(false);
  });
});

describe('buildDiagnosis', () => {
  const CV = 'Data Analyst - Atelier Nova\nTableaux de bord POWER BI, SQL et Python.';

  it('[EF-CVX-24] [RG-23] computes the overall score itself', () => {
    expect(buildDiagnosis(ANSWER, CV).overallScore).toBe(70);
  });

  it('[EF-CVX-27] keeps as missing only the skills the CV really does not cite, whatever their case', () => {
    expect(buildDiagnosis(ANSWER, CV).missingSkills).toEqual(['dbt', 'Airflow']);
  });

  it(`[EF-CVX-30] names as weak the dimensions scored below ${String(WEAK_SCORE_BELOW)}`, () => {
    const diagnosis = buildDiagnosis({ ...ANSWER, experience: explained(50) }, CV);

    expect(diagnosis.weakDimensions).toEqual(['techStack']);
  });

  it('[EF-CVX-27] lists each missing skill once', () => {
    expect(buildDiagnosis({ ...ANSWER, missingSkills: ['dbt', 'DBT', ' dbt '] }, CV).missingSkills).toEqual(['dbt']);
  });
});
