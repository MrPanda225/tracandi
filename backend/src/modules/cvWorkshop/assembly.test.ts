import { describe, expect, it } from 'vitest';
import { PARSED_CV, PARSED_CV_SOURCE } from '../../../tests/fixtures/cv/parsedCv.js';
import { assembleCv, buildChanges } from './assembly.js';
import { cvBlocks } from './onePage.js';
import { type TailorCvAnswer, TailorCvAnswerSchema } from './tailorCvAnswer.js';

const answerOf = (changes: Record<string, unknown> = {}): TailorCvAnswer =>
  TailorCvAnswerSchema.parse({
    headline: 'Data Analyst',
    profile: 'Analyste de données tournée vers les tableaux de bord.',
    experiences: [{ id: 'exp_0', bullets: ['Conception de 12 tableaux de bord Power BI.'] }],
    education: [{ id: 'edu_0', details: ['edu_0.d0'] }],
    skills: ['skill_0', 'skill_2'],
    certifications: [],
    languages: [],
    interests: [],
    changes: [],
    ...changes,
  });

const assemble = (answer: TailorCvAnswer) => assembleCv({ parsed: PARSED_CV, answer, sourceText: PARSED_CV_SOURCE });
const bulletsOf = (bullets: string[]) => assemble(answerOf({ experiences: [{ id: 'exp_0', bullets }] })).experiences[0]?.bullets;

describe('assembleCv', () => {
  it('[EF-CVX-47] [RG-21] copies every fact from the parsed CV, whatever the model writes next to the ids', () => {
    const answer = answerOf({
      experiences: [
        { id: 'exp_0', title: 'Lead Data Engineer', organization: 'Groupe Imaginaire', dates: '2030', bullets: ['Création de 12 tableaux.'] },
      ],
    });

    const cv = assemble(answer);

    expect(cv.experiences[0]).toMatchObject({
      title: 'Data Analyst',
      organization: 'Atelier Nova',
      place: 'Paris',
      dates: '09/2021 – 06/2023',
      bullets: ['Création de 12 tableaux.'],
    });
    expect(cv.education[0]).toMatchObject({ degree: 'Master Informatique', school: 'Université de Lyon', dates: '2019 – 2021' });
  });

  it('[RG-24] keeps an experience the model omitted, with its facts and no bullet, in the order of the CV', () => {
    const cv = assemble(answerOf({ experiences: [] }));

    expect(cv.experiences.map((experience) => experience.title)).toEqual(['Data Analyst', 'Développeuse']);
    expect(cv.experiences[0]?.bullets).toEqual([]);
    expect(cv.education).toHaveLength(1);
  });

  it('[RG-21] ignores an id the CV does not have', () => {
    const cv = assemble(
      answerOf({
        experiences: [{ id: 'exp_9', bullets: ['Inventée.'] }, { id: 'exp_1', bullets: ['Programmation de modules.'] }],
        skills: ['skill_99', 'skill_1'],
      }),
    );

    expect(cv.experiences).toHaveLength(2);
    expect(cv.experiences[1]?.bullets).toEqual(['Programmation de modules.']);
    expect(cv.skills).toEqual(['Python']);
  });

  it('[RG-21] removes a bullet citing a figure the CV does not carry, and keeps the others', () => {
    expect(
      bulletsOf(['Plus de 5 ans d’expérience en tableaux de bord.', 'Gestion de 40 serveurs.', 'Création de 12 tableaux de bord Power BI.']),
    ).toEqual(['Création de 12 tableaux de bord Power BI.']);
  });

  it('[RG-21] reads « 10000 » and « 10 000 » as the same figure', () => {
    expect(bulletsOf(['Support de 10000 utilisateurs.', 'Support de 10 000 utilisateurs.'])).toEqual([
      'Support de 10000 utilisateurs.',
      'Support de 10 000 utilisateurs.',
    ]);
    expect(bulletsOf(['Support de 100 000 utilisateurs.'])).toEqual([]);
  });

  it('[RG-21] removes the sentences of the profile citing an absent figure', () => {
    const cv = assemble(answerOf({ profile: 'Analyste de données. Cinq ans, soit 60 mois d’expérience. Goût du détail.' }));

    expect(cv.profile).toBe('Analyste de données. Goût du détail.');
  });

  it('[RG-21] falls back on the headline of the CV, then on the first title, when the model’s is unusable', () => {
    expect(assemble(answerOf({ headline: 'Data Analyst depuis 15 ans' })).headline).toBe('Data analyst confirmé');
    expect(assemble(answerOf({ headline: null })).headline).toBe('Data analyst confirmé');
    const withoutHeadline = assembleCv({
      parsed: { ...PARSED_CV, headline: null },
      answer: answerOf({ headline: null }),
      sourceText: PARSED_CV_SOURCE,
    });
    expect(withoutHeadline.headline).toBe('Data Analyst');
  });

  it('[EF-CVX-47] maps the chosen ids to their source texts, in the order of the CV, and keeps every item when none is chosen', () => {
    const cv = assemble(answerOf({ skills: ['skill_2', 'skill_0'], languages: [], interests: ['int_0'], certifications: [] }));

    expect(cv.skills).toEqual(['SQL', 'Power BI']);
    expect(cv.languages).toEqual(['Anglais courant']);
    expect(cv.interests).toEqual(['Course à pied']);
    expect(cv.education[0]?.detail).toBe('Mention bien');
    expect(assemble(answerOf({ skills: [] })).skills).toEqual(['SQL', 'Python', 'Power BI']);
  });

  it('[RG-24] renders an experience without organization nor dates with no stray separator', () => {
    const cv = assemble(answerOf());
    const entries = cvBlocks({ cv, contacts: { name: null, emails: [], phones: [], address: null, links: [] }, addedSkills: [] })
      .filter((block) => block.kind === 'entry')
      .map((block) => block.text);

    expect(entries).toEqual([
      'Data Analyst — Atelier Nova, Paris | 09/2021 – 06/2023',
      'Développeuse',
      'Master Informatique — Université de Lyon | 2019 – 2021',
    ]);
  });
});

describe('buildChanges', () => {
  const changes = [
    { target: 'exp_0', reason: 'Plus proche du vocabulaire de l’offre.' },
    { target: 'headline', reason: 'Titre de l’offre.' },
    { target: 'profile', reason: 'Plus court.' },
  ];

  it('[EF-CVX-29] gives the CV’s own text as before and the final text as after, with the model’s reason', () => {
    const answer = answerOf({ changes });

    const built = buildChanges({ parsed: PARSED_CV, answer, cv: assemble(answer) });

    expect(built).toEqual([
      {
        section: 'Expériences professionnelles',
        before: 'Création de 12 tableaux de bord Power BI · Automatisation de rapports avec Python · Support de 10 000 utilisateurs',
        after: 'Conception de 12 tableaux de bord Power BI.',
        reason: 'Plus proche du vocabulaire de l’offre.',
      },
      { section: 'Titre du CV', before: 'Data analyst confirmé', after: 'Data Analyst', reason: 'Titre de l’offre.' },
      {
        section: 'Profil',
        before: 'Analyste de données. Trois ans en tableaux de bord.',
        after: 'Analyste de données tournée vers les tableaux de bord.',
        reason: 'Plus court.',
      },
    ]);
  });

  it('[EF-CVX-29] drops a change whose text did not change or whose target does not exist, and shows the text after removals', () => {
    const answer = answerOf({
      headline: 'Data analyst confirmé',
      experiences: [{ id: 'exp_0', bullets: ['Gestion de 40 serveurs.', 'Création de 12 tableaux.'] }],
      changes: [...changes, { target: 'exp_7', reason: 'Inconnue.' }, { target: 'headline', reason: 'Deux fois.' }],
    });

    const built = buildChanges({ parsed: PARSED_CV, answer, cv: assemble(answer) });

    expect(built.map((change) => change.section)).toEqual(['Expériences professionnelles', 'Profil']);
    expect(built[0]?.after).toBe('Création de 12 tableaux.');
  });
});
