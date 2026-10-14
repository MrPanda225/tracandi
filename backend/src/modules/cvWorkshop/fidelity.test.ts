import { describe, expect, it } from 'vitest';
import { PARSED_CV, PARSED_CV_SOURCE } from '../../../tests/fixtures/cv/parsedCv.js';
import type { AdaptedCv } from './adaptedCv.js';
import { assembleCv } from './assembly.js';
import { unfaithfulPaths } from './fidelity.js';
import { TailorCvAnswerSchema } from './tailorCvAnswer.js';

const ANSWER = TailorCvAnswerSchema.parse({
  headline: 'Data Analyst',
  profile: 'Analyste de données.',
  experiences: [{ id: 'exp_0', bullets: ['Conception de 12 tableaux de bord.'] }],
  education: [{ id: 'edu_0', details: ['edu_0.d0', 'edu_0.d1'] }],
  skills: [],
  changes: [],
});
const CV: AdaptedCv = assembleCv({ parsed: PARSED_CV, answer: ANSWER, sourceText: PARSED_CV_SOURCE });
const pathsOf = (changes: Partial<AdaptedCv>): string[] =>
  unfaithfulPaths({ ...CV, ...changes }, PARSED_CV_SOURCE).map((path) => path.join('.'));

describe('unfaithfulPaths (RG-21)', () => {
  it('[RG-21] finds nothing in a CV assembled from the parse', () => {
    expect(pathsOf({})).toEqual([]);
  });

  it('[RG-21] reads a fact in the source whatever its punctuation, dashes and case', () => {
    const experience = { ...CV.experiences[0], dates: '09/2021 - 06/2023', organization: 'atelier nova' } as AdaptedCv['experiences'][number];

    expect(pathsOf({ experiences: [experience] })).toEqual([]);
  });

  it('[RG-21] finds a fact the source does not have, as a path without its value', () => {
    const experience = { ...CV.experiences[0], organization: 'Groupe Imaginaire' } as AdaptedCv['experiences'][number];

    const paths = unfaithfulPaths({ ...CV, experiences: [experience], skills: ['dbt'] }, PARSED_CV_SOURCE);

    expect(paths).toEqual([['experiences', 0, 'organization'], ['skills', 0]]);
    expect(JSON.stringify(paths)).not.toContain('Imaginaire');
  });

  it('[RG-21] finds a figure in a free text that the source does not carry', () => {
    const experience = { ...CV.experiences[0], bullets: ['Gestion de 40 serveurs.'] } as AdaptedCv['experiences'][number];

    expect(pathsOf({ experiences: [experience], profile: 'Dix ans, soit 120 mois.' })).toEqual([
      'profile',
      'experiences.0.bullets.0',
    ]);
  });
});
