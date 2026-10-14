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
// What the candidate would see of a list: the items the CV does not cite are gone (RG-21, v1.38).
const kept = (answer: Answer, key: 'skills' | 'certifications' | 'interests' | 'languages'): string[] => {
  const result = schema.safeParse(answer);
  return result.success ? (result.data.cv[key] as string[]) : ['REJECTED'];
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

  it('[EF-CVX-27] [RG-21] removes a skill, tool, certification or interest the CV does not cite', () => {
    expect(kept(withCv({ skills: ['SQL', 'dbt'] }), 'skills')).toEqual(['SQL']);
    expect(kept(withCv({ certifications: ['AWS Certified Data Engineer'] }), 'certifications')).toEqual([]);
    expect(kept(withCv({ interests: ['Parapente'] }), 'interests')).toEqual([]);
  });

  it('[RG-21] checks each skill of a grouped line, whatever the punctuation around them', () => {
    // The CV says « COMPETENCES » then « SQL, Python, Power BI »: the model regroups them under a heading.
    expect(rejectedPaths(withCv({ skills: ['Compétences : Python, SQL', 'Power BI / SQL', 'SQL · Python'] }))).toEqual([]);
    expect(kept(withCv({ skills: ['Compétences : Python, dbt'] }), 'skills')).toEqual([]);
    expect(kept(withCv({ skills: ['Outils : Power BI'] }), 'skills')).toEqual([]);
  });

  it('[RG-21] accepts a language the CV cites, its level reworded, and removes one it does not', () => {
    expect(rejectedPaths(withCv({ languages: ['Anglais : niveau professionnel'] }))).toEqual([]);
    expect(kept(withCv({ languages: ['Espagnol : courant'] }), 'languages')).toEqual([]);
  });

  it('[RG-21] reads the CV whatever its case, accents and dashes', () => {
    expect(rejectedPaths(withCv({ skills: ['power bi', 'PYTHON'] }))).toEqual([]);
    expect(rejectedPaths(withExperience({ dates: '09/2024 - 08/2026' }))).toEqual([]);
  });

  it('[RG-21] reads a CV whose PDF text has ligatures, invisible characters and typographic variants', () => {
    const pdfSchema = tailoredAnswerSchemaFor(
      `${SOURCE}\nCompétences\nConﬁguration, Certi\u00ADﬁcation\u200B Cloud\nCertiﬁcation Scrum`,
    );
    const answer = withCv({ skills: ['Configuration', 'Certification Cloud'], certifications: ['Certification Scrum'] });

    expect(pdfSchema.safeParse(answer).success).toBe(true);
  });

  it('[RG-21] [EF-CVX-26] removes a skill the CV does not cite, and the change that announces it, instead of rejecting the CV', () => {
    const change = (after: string) => ({ section: 'Compétences', before: '', after, reason: 'Pour l’offre.' });
    const answer: Answer = {
      ...FAITHFUL,
      cv: { ...FAITHFUL.cv, skills: ['SQL', 'dbt', 'Python'], certifications: ['AWS Certified Data Engineer'], interests: ['Parapente'] },
      changes: [...FAITHFUL.changes, change('Ajout de dbt à vos compétences.'), change('Compétences : SQL, Python')],
    };

    const result = schema.safeParse(answer);

    expect(result.success).toBe(true);
    const data = result.data as Answer & { cv: { skills: string[]; certifications: string[]; interests: string[] } };
    expect(data.cv.skills).toEqual(['SQL', 'Python']);
    expect(data.cv.certifications).toEqual([]);
    expect(data.cv.interests).toEqual([]);
    const shown = JSON.stringify(data.changes);
    expect(shown).not.toContain('dbt');
    expect(shown).toContain('Compétences : SQL, Python');
    expect(data.changes).toHaveLength(FAITHFUL.changes.length + 1);
  });

  it('[RG-21] removes a grouped line and a language when one of their parts is not in the CV', () => {
    const result = schema.safeParse(withCv({ skills: ['Langages : Python, dbt', 'SQL'], languages: ['Espagnol : courant', 'Anglais : courant'] }));

    expect(result.success).toBe(true);
    expect((result.data as { cv: { skills: string[]; languages: string[] } }).cv).toMatchObject({
      skills: ['SQL'],
      languages: ['Anglais : courant'],
    });
  });

  it('[RG-21] still rejects an invented company next to a removable skill', () => {
    expect(rejectedPaths(withCv({ skills: ['dbt'], experiences: [{ ...FAITHFUL.cv.experiences[0], organization: 'Groupe Imaginaire' }] }))).toEqual([
      'cv.experiences.0.organization',
    ]);
  });

  it('[EF-CVX-29] requires each change to give its section, before, after and reason', () => {
    const change = { section: 'Profil', before: 'Ancien', after: 'Nouveau', reason: 'Pour l’offre.' };
    // A change of the profile quotes it whole: up to the length a profile may have.
    const wholeProfile = 'p'.repeat(1_200);

    expect(schema.safeParse({ ...FAITHFUL, changes: [change] }).success).toBe(true);
    expect(schema.safeParse({ ...FAITHFUL, changes: [{ ...change, before: wholeProfile, after: wholeProfile }] }).success).toBe(true);
    expect(schema.safeParse({ ...FAITHFUL, changes: [{ ...change, reason: '' }] }).success).toBe(false);
    expect(schema.safeParse({ ...FAITHFUL, changes: Array.from({ length: 31 }, () => change) }).success).toBe(false);
  });
});
