import { describe, expect, it } from 'vitest';
import type { DeducedTarget } from '../../../api/cvTypes';
import {
  type DeductionOfCv,
  doesLevelOverrideYears,
  draftOf,
  levelOf,
  type OfferDraft,
  type ProfileDraft,
  profileBodyOf,
  profileProblems,
} from './profileDraft';

const target = (label: string): DeducedTarget => ({
  label,
  keywords: ['data', 'sql'],
  contractTypes: ['cdi', 'alternance'],
  level: 'confirme',
});

const analyst: DeductionOfCv = {
  cvId: 1,
  cvLabel: 'Data analyst',
  deduction: { years: 4, level: 'confirme', targets: [target('Data analyst'), target('BI analyst')] },
};
const developer: DeductionOfCv = {
  cvId: 2,
  cvLabel: 'Développeur',
  deduction: { years: 6, level: 'confirme', targets: [target('Développeur Python')] },
};

const draft = (changes: Partial<ProfileDraft> = {}): ProfileDraft => ({ ...draftOf([analyst]), ...changes });

const offerAt = (profile: ProfileDraft, index: number): OfferDraft => {
  const offer = profile.offers[index];
  if (!offer) throw new Error(`No offer at ${String(index)} in the draft.`);
  return offer;
};

describe('draftOf', () => {
  it('[EF-VEI-47] starts from the most years counted on the CV types, as text to correct', () => {
    expect(draftOf([analyst, developer]).years).toBe('6');
  });

  it('[EF-VEI-45] gathers the offers proposed by every CV type, each remembering its CV, all kept up to five', () => {
    const offers = draftOf([analyst, developer]).offers;

    expect(offers.map((offer) => [offer.label, offer.source, offer.isKept])).toEqual([
      ['Data analyst', 'Data analyst', true],
      ['BI analyst', 'Data analyst', true],
      ['Développeur Python', 'Développeur', true],
    ]);
    expect(offers[0]).toMatchObject({ keywords: 'data, sql', contractTypes: ['cdi', 'alternance'] });
  });

  it('[EF-VEI-45] keeps the first five offers when more are proposed, the others left to choose', () => {
    const many: DeductionOfCv = {
      cvId: 3,
      cvLabel: 'Mix',
      deduction: { years: 2, level: 'junior', targets: ['a', 'b', 'c', 'd', 'e'].map(target) },
    };

    // Seven proposed — two from the first CV, five from the second.
    expect(draftOf([analyst, many]).offers.map((offer) => offer.isKept)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('levelOf', () => {
  it('[EF-VEI-47] [RG-28] follows the years the candidate types', () => {
    expect(levelOf(draft({ years: '2' }))).toBe('junior');
    expect(levelOf(draft({ years: '3' }))).toBe('confirme');
    expect(levelOf(draft({ years: '8' }))).toBe('senior');
  });

  it('[EF-VEI-47] is the level the candidate picked, once they pick one', () => {
    expect(levelOf(draft({ years: '3', manualLevel: 'senior' }))).toBe('senior');
  });

  it('[EF-VEI-47] is none while the years are empty or refused', () => {
    expect(levelOf(draft({ years: '' }))).toBeNull();
    expect(levelOf(draft({ years: '51' }))).toBeNull();
  });
});

describe('doesLevelOverrideYears', () => {
  it('[EF-VEI-47] is true only for a level picked that the years do not give', () => {
    expect(doesLevelOverrideYears(draft({ years: '4', manualLevel: 'senior' }))).toBe(true);
    expect(doesLevelOverrideYears(draft({ years: '4', manualLevel: 'confirme' }))).toBe(false);
    expect(doesLevelOverrideYears(draft({ years: '4' }))).toBe(false);
    expect(doesLevelOverrideYears(draft({ years: '', manualLevel: 'senior' }))).toBe(false);
  });
});

describe('profileProblems', () => {
  it('[EF-VEI-46] finds none in a profile as it was deduced', () => {
    expect(profileProblems(draftOf([analyst, developer]))).toEqual({
      years: null,
      level: null,
      offers: null,
      perOffer: new Map(),
    });
  });

  it('[EF-VEI-47] refuses 51 years, and asks for years or a level when both are missing', () => {
    expect(profileProblems(draft({ years: '51' })).years).toBe(
      'Indiquez un nombre entier d’années, de 0 à 50.',
    );
    expect(profileProblems(draft({ years: '' })).level).toBe(
      'Indiquez vos années d’expérience, ou choisissez un niveau.',
    );
    expect(profileProblems(draft({ years: '', manualLevel: 'junior' })).level).toBeNull();
  });

  it('[EF-VEI-45] wants from one to five offers kept', () => {
    const none = draftOf([analyst]);
    expect(
      profileProblems({ ...none, offers: none.offers.map((offer) => ({ ...offer, isKept: false })) }).offers,
    ).toBe('Gardez au moins une offre type.');
    const six = draftOf([
      { ...analyst, deduction: { ...analyst.deduction, targets: 'abcdef'.split('').map(target) } },
    ]);
    expect(
      profileProblems({ ...six, offers: six.offers.map((offer) => ({ ...offer, isKept: true })) }).offers,
    ).toBe('Gardez 5 offres types au plus.');
  });

  it('[EF-VEI-45] checks the label, the keywords and the contracts of the offers kept, and only those', () => {
    const base = draftOf([analyst]);
    const first = offerAt(base, 0);
    const edited: ProfileDraft = {
      ...base,
      offers: [
        { ...first, label: '', keywords: '', contractTypes: [] },
        { ...offerAt(base, 1), label: '', isKept: false },
      ],
    };

    const { perOffer } = profileProblems(edited);

    expect([...perOffer.keys()]).toEqual([first.key]);
    expect(perOffer.get(first.key)).toEqual({
      label: 'Indiquez un intitulé.',
      keywords: 'Indiquez au moins un mot-clé.',
      contracts: 'Choisissez au moins un contrat.',
    });
  });
});

describe('profileBodyOf', () => {
  it('[EF-VEI-46] sends the offers kept and the years, the level following from them', () => {
    expect(profileBodyOf(draft({ years: '6' }))).toEqual({
      targets: [
        { label: 'Data analyst', keywords: ['data', 'sql'], contractTypes: ['cdi', 'alternance'] },
        { label: 'BI analyst', keywords: ['data', 'sql'], contractTypes: ['cdi', 'alternance'] },
      ],
      years: 6,
    });
  });

  it('[EF-VEI-47] sends the corrected years, not the ones that were counted', () => {
    expect(profileBodyOf(draft({ years: '9' }))).toMatchObject({ years: 9 });
  });

  it('[EF-VEI-47] sends the picked level alone when it is not the one the years give: the years would win', () => {
    const body = profileBodyOf(draft({ years: '4', manualLevel: 'senior' }));

    expect(body).toMatchObject({ level: 'senior' });
    expect(body).not.toHaveProperty('years');
  });

  it('[EF-VEI-47] sends the years when the level picked is the one they give', () => {
    const body = profileBodyOf(draft({ years: '4', manualLevel: 'confirme' }));

    expect(body).toMatchObject({ years: 4 });
    expect(body).not.toHaveProperty('level');
  });

  it('[EF-VEI-47] sends the level alone when there are no years', () => {
    expect(profileBodyOf(draft({ years: '', manualLevel: 'junior' }))).toMatchObject({ level: 'junior' });
  });

  it('[EF-VEI-46] trims what was edited, keeps only the offers kept, and sends no level beside an offer', () => {
    const base = draftOf([analyst]);
    const body = profileBodyOf({
      ...base,
      offers: [
        { ...offerAt(base, 0), label: '  Analyste BI  ', keywords: ' bi , SQL,sql ' },
        { ...offerAt(base, 1), isKept: false },
      ],
    });

    expect(body.targets).toEqual([
      { label: 'Analyste BI', keywords: ['bi', 'SQL'], contractTypes: ['cdi', 'alternance'] },
    ]);
  });
});
