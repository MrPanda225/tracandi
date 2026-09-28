import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { separateContacts } from './contacts.js';
import { tailoredAnswerSchemaFor } from './fidelity.js';

type Answer = { cv: Record<string, unknown> & { experiences: Record<string, unknown>[] }; changes: unknown[] };

const FAITHFUL = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/llm/tailor_cv.json', import.meta.url), 'utf8'),
) as Answer;
// What the AI received: the fictitious CV, contact details taken out (ENF-RGP-07).
const SOURCE = `${separateContacts(FICTITIOUS_CV_LINES.join('\n')).text}\nANGLAIS courant\nCourse à pied`;
const schema = tailoredAnswerSchemaFor(SOURCE);

const withCv = (changes: Record<string, unknown>): Answer => ({ ...FAITHFUL, cv: { ...FAITHFUL.cv, ...changes } });
const withExperience = (changes: Record<string, unknown>): Answer =>
  withCv({ experiences: [{ ...FAITHFUL.cv.experiences[0], ...changes }] });
const rejectedPaths = (answer: Answer): string[] => {
  const result = schema.safeParse(answer);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('tailoredAnswerSchemaFor (RG-21)', () => {
  it('[RG-21] accepts an adapted CV that rephrases, with the words of the offer, only what the CV says', () => {
    expect(rejectedPaths(FAITHFUL)).toEqual([]);
  });

  it('[EF-CVX-26] [RG-21] rejects an invented company, and says which field without quoting it', () => {
    const result = schema.safeParse(withExperience({ organization: 'Groupe Imaginaire' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['cv.experiences.0.organization']);
    expect(JSON.stringify(result.error?.issues)).not.toContain('Imaginaire');
  });

  it('[RG-21] rejects a job title, dates or place the CV does not give', () => {
    expect(rejectedPaths(withExperience({ title: 'Lead Data Engineer' }))).toEqual(['cv.experiences.0.title']);
    expect(rejectedPaths(withExperience({ dates: '01/2023 – 08/2026' }))).toEqual(['cv.experiences.0.dates']);
    expect(rejectedPaths(withExperience({ place: 'Paris' }))).toEqual(['cv.experiences.0.place']);
  });

  it('[RG-21] rejects an invented degree or school', () => {
    const education = (changes: Record<string, unknown>) =>
      withCv({ education: [{ degree: 'Master Informatique', school: 'Université de Lyon', place: null, dates: '2024', detail: null, ...changes }] });

    expect(rejectedPaths(education({ degree: 'Doctorat en informatique' }))).toEqual(['cv.education.0.degree']);
    expect(rejectedPaths(education({ school: 'École polytechnique' }))).toEqual(['cv.education.0.school']);
  });

  it('[RG-21] rejects a figure the CV does not give, wherever it is written', () => {
    expect(rejectedPaths(withExperience({ bullets: ['Tableaux de bord Power BI pour 40 équipes commerciales.'] }))).toEqual([
      'cv.experiences.0.bullets.0',
    ]);
    expect(rejectedPaths(withCv({ profile: 'Trois ans d’expérience, 98 % de satisfaction.' }))).toEqual(['cv.profile']);
  });

  it('[EF-CVX-27] [RG-21] rejects a skill, tool, certification or interest the CV does not cite', () => {
    expect(rejectedPaths(withCv({ skills: ['SQL', 'dbt'] }))).toEqual(['cv.skills.1']);
    expect(rejectedPaths(withCv({ certifications: ['AWS Certified Data Engineer'] }))).toEqual(['cv.certifications.0']);
    expect(rejectedPaths(withCv({ interests: ['Parapente'] }))).toEqual(['cv.interests.0']);
  });

  it('[RG-21] accepts a language the CV cites, its level reworded, and rejects one it does not', () => {
    expect(rejectedPaths(withCv({ languages: ['Anglais : niveau professionnel'] }))).toEqual([]);
    expect(rejectedPaths(withCv({ languages: ['Espagnol : courant'] }))).toEqual(['cv.languages.0']);
  });

  it('[RG-21] reads the CV whatever its case, accents and dashes', () => {
    expect(rejectedPaths(withCv({ skills: ['power bi', 'PYTHON'] }))).toEqual([]);
    expect(rejectedPaths(withExperience({ dates: '09/2024 - 08/2026' }))).toEqual([]);
  });

  it('[EF-CVX-29] requires each change to give its section, before, after and reason', () => {
    const change = { section: 'Profil', before: 'Ancien', after: 'Nouveau', reason: 'Pour l’offre.' };

    expect(schema.safeParse({ ...FAITHFUL, changes: [change] }).success).toBe(true);
    expect(schema.safeParse({ ...FAITHFUL, changes: [{ ...change, reason: '' }] }).success).toBe(false);
    expect(schema.safeParse({ ...FAITHFUL, changes: Array.from({ length: 31 }, () => change) }).success).toBe(false);
  });
});
