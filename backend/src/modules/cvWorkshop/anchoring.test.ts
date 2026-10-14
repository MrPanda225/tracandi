import { describe, expect, it } from 'vitest';
import { anchorParsedCv } from './anchoring.js';
import { numberCvLines } from './cvLines.js';
import { type ParseCvAnswer, ParseCvAnswerSchema } from './parseCvAnswer.js';

const EMPTY: ParseCvAnswer = ParseCvAnswerSchema.parse({});
const ref = (line: number, text: string, toLine?: number) => ({ line, text, ...(toLine ? { toLine } : {}) });
const answerWith = (patch: Record<string, unknown>): ParseCvAnswer => ParseCvAnswerSchema.parse(patch);

const LINES = numberCvLines(
  [
    'Développeur Full Stack',
    'Senior',
    'Atelier Nova – Paris, France',
    '2021 – 2023',
    'Création de 12 tableaux de bord',
    'Master Informatique Université de Lyon',
    'Sept. 2021 – Présent',
    'SQL • Python',
  ].join('\n'),
);

const experience = (title: ReturnType<typeof ref>, extra: Record<string, unknown> = {}) =>
  answerWith({ experiences: [{ title, ...extra }] });

describe('anchorParsedCv', () => {
  it('[EF-CVX-46] [RG-21] copies the text the reference points to', () => {
    const cv = anchorParsedCv(answerWith({ headline: ref(8, 'SQL') }), LINES);

    expect(cv.headline).toBe('SQL');
    expect(cv.dropped).toBe(0);
  });

  it('[RG-21] returns the source spelling, not the case or accents the model wrote', () => {
    const cv = anchorParsedCv(experience(ref(1, 'developpeur full stack')), LINES);

    expect(cv.experiences[0]?.title).toBe('Développeur Full Stack');
  });

  it('[EF-CVX-46] ignores punctuation, spaces and dashes when matching', () => {
    const cv = anchorParsedCv(experience(ref(1, 'Développeur'), { dates: ref(4, '2021-2023') }), LINES);

    expect(cv.experiences[0]?.dates).toBe('2021 – 2023');
  });

  it('[EF-CVX-46] anchors a title wrapped over two lines with toLine', () => {
    const cv = anchorParsedCv(experience(ref(1, 'Développeur Full Stack Senior', 2)), LINES);

    expect(cv.experiences[0]?.title).toBe('Développeur Full Stack Senior');
  });

  it('[EF-CVX-46] anchors a fact the model put on the wrong line', () => {
    const cv = anchorParsedCv(experience(ref(1, 'Développeur'), { organization: ref(1, 'Atelier Nova') }), LINES);

    expect(cv.experiences[0]?.organization).toBe('Atelier Nova');
    expect(cv.dropped).toBe(0);
  });

  it('[EF-CVX-46] keeps only the part of the line the reference covers', () => {
    const cv = anchorParsedCv(experience(ref(1, 'Développeur'), { place: ref(3, 'Paris') }), LINES);

    expect(cv.experiences[0]?.place).toBe('Paris');
  });

  it('[EF-CVX-46] tolerates two foreign tokens between the tokens of a reference, not three', () => {
    const two = anchorParsedCv(
      answerWith({ headline: ref(1, 'Data analyst senior') }),
      numberCvLines('Data analyst Atelier Nova senior'),
    );
    const three = anchorParsedCv(
      answerWith({ headline: ref(1, 'Data analyst senior') }),
      numberCvLines('Data analyst A B C senior'),
    );

    expect(two.headline).toBe('Data analyst Atelier Nova senior');
    expect(three.headline).toBeNull();
    expect(three.dropped).toBe(1);
  });

  it('[RG-21] drops a reference to a line that does not exist or to text absent from the CV, and keeps the rest', () => {
    const cv = anchorParsedCv(
      experience(ref(1, 'Développeur'), {
        organization: ref(99, 'Entreprise Inconnue'),
        place: ref(3, 'Tokyo'),
        bullets: [ref(5, 'Création de 12 tableaux de bord'), ref(5, 'Pilotage d’une équipe de dix personnes')],
      }),
      LINES,
    );

    expect(cv.experiences[0]).toMatchObject({ organization: null, place: null });
    expect(cv.experiences[0]?.bullets).toEqual([{ id: 'exp_0.b0', text: 'Création de 12 tableaux de bord' }]);
    expect(cv.dropped).toBe(3);
  });

  it('[RG-21] never anchors a reference whose figure the source does not carry', () => {
    const cv = anchorParsedCv(
      answerWith({ skills: [ref(5, 'Création de 15 tableaux de bord'), ref(5, 'Création de 12 tableaux de bord')] }),
      LINES,
    );

    expect(cv.skills).toEqual([{ id: 'skill_0', text: 'Création de 12 tableaux de bord' }]);
    expect(cv.dropped).toBe(1);
  });

  it('[RG-21] drops an experience without an anchored title and an education entry without an anchored degree', () => {
    const cv = anchorParsedCv(
      answerWith({
        experiences: [{ title: ref(1, 'Directeur général') }, { title: ref(1, 'Développeur Full Stack') }],
        education: [{ degree: ref(6, 'Doctorat') }, { degree: ref(6, 'Master Informatique') }],
      }),
      LINES,
    );

    expect(cv.experiences.map(({ id, title }) => [id, title])).toEqual([['exp_0', 'Développeur Full Stack']]);
    expect(cv.education.map(({ id, degree }) => [id, degree])).toEqual([['edu_0', 'Master Informatique']]);
    expect(cv.dropped).toBe(2);
  });

  it('[EF-CVX-46] accepts a date written another way when both read as the same period, and keeps the source text', () => {
    const cv = anchorParsedCv(experience(ref(1, 'Développeur'), { dates: ref(7, '09/2021 - aujourd’hui') }), LINES);

    expect(cv.experiences[0]?.dates).toBe('Sept. 2021 – Présent');
    expect(cv.dropped).toBe(0);
  });

  it('[RG-21] does not accept a date of another period', () => {
    const cv = anchorParsedCv(experience(ref(1, 'Développeur'), { dates: ref(7, '09/2020 - aujourd’hui') }), LINES);

    expect(cv.experiences[0]?.dates).toBeNull();
    expect(cv.dropped).toBe(1);
  });

  it('[EF-CVX-46] assigns the ids in order, whatever the model says, and joins the profile lines', () => {
    const cv = anchorParsedCv(
      answerWith({
        profile: [ref(1, 'Développeur Full Stack'), ref(2, 'Senior')],
        skills: [ref(8, 'SQL'), ref(8, 'Python')],
        languages: [ref(1, 'Développeur')],
        certifications: [ref(5, 'Création')],
        interests: [ref(2, 'Senior')],
      }),
      LINES,
    );

    expect(cv.profile).toBe('Développeur Full Stack Senior');
    expect(cv.skills.map(({ id }) => id)).toEqual(['skill_0', 'skill_1']);
    expect([cv.languages[0]?.id, cv.certifications[0]?.id, cv.interests[0]?.id]).toEqual(['lang_0', 'cert_0', 'int_0']);
  });

  it('[EF-CVX-46] returns an empty CV for an empty answer', () => {
    expect(anchorParsedCv(EMPTY, LINES)).toMatchObject({ headline: null, profile: null, experiences: [], dropped: 0 });
  });
});

describe('ParseCvAnswerSchema', () => {
  it('[EF-CVX-46] leaves out a malformed pointer or entry and keeps the others', () => {
    const answer = ParseCvAnswerSchema.parse({
      headline: 'Data analyst',
      skills: [ref(1, 'SQL'), { line: 'x' }, null],
      experiences: [{ title: null }, { title: ref(1, 'Poste'), place: { line: 0, text: '' } }],
    });

    expect(answer.headline).toBeNull();
    expect(answer.skills).toHaveLength(1);
    expect(answer.experiences).toHaveLength(1);
    expect(answer.experiences[0]?.place).toBeNull();
  });

  it('[EF-CVX-46] bounds the lists', () => {
    const answer = ParseCvAnswerSchema.parse({ skills: Array.from({ length: 200 }, () => ref(1, 'SQL')) });

    expect(answer.skills).toHaveLength(60);
  });

  it('[EF-CVX-46] refuses an answer with an unknown key', () => {
    expect(ParseCvAnswerSchema.safeParse({ salary: 1 }).success).toBe(false);
  });
});
