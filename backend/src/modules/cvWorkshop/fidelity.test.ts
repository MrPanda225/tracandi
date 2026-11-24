import { describe, expect, it } from 'vitest';
import { PARSED_CV, PARSED_CV_SOURCE } from '../../../tests/fixtures/cv/parsedCv.js';
import type { AdaptedCv } from './adaptedCv.js';
import { assembleCv } from './assembly.js';
import { freeTextCheck, unfaithfulPaths } from './fidelity.js';
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

  it('[RG-21] [EF-CVX-47] finds a skill absent from the CV, or a duration it does not state, in a free text', () => {
    const experience = { ...CV.experiences[0], bullets: ['Modélisation des données avec dbt.'] } as AdaptedCv['experiences'][number];
    const cv = { ...CV, experiences: [experience], profile: 'Cinq ans d’expérience en BI.' };

    expect(unfaithfulPaths(cv, PARSED_CV_SOURCE, ['dbt']).map((path) => path.join('.'))).toEqual([
      'profile',
      'experiences.0.bullets.0',
    ]);
  });
});

describe('freeTextCheck (RG-21)', () => {
  it('[RG-21] keeps a bullet where a short missing skill is only part of another word, removes one that cites it', () => {
    const isFaithful = freeTextCheck(PARSED_CV_SOURCE, ['C', 'Go']);

    expect(isFaithful('C’est avec rigueur que j’ai fiabilisé les tableaux de bord.')).toBe(true);
    expect(isFaithful('Préparation du go-live.')).toBe(true);
    expect(isFaithful('Développement en C.')).toBe(false);
  });

  it('[RG-21] removes a bullet citing a missing short skill joined by a hyphen: « R-Shiny » when R is not in the CV', () => {
    const isFaithful = freeTextCheck(PARSED_CV_SOURCE, ['R']);

    expect(isFaithful('Applications R-Shiny pour la direction.')).toBe(false);
    expect(isFaithful('Budget de R&D suivi chaque mois.')).toBe(true);
  });
});
