import { describe, expect, it } from 'vitest';
import { OfferTraitsAnswerSchema, suggestedLevelOf } from './traits.js';

describe('OfferTraitsAnswerSchema', () => {
  it('[EF-VEI-49] accepts a title and from one to fifteen keywords', () => {
    expect(OfferTraitsAnswerSchema.safeParse({ title: 'Data analyst', keywords: ['sql'] }).success).toBe(
      true,
    );
    const fifteen = Array.from({ length: 15 }, (_unused, index) => `mot${String(index)}`);
    expect(OfferTraitsAnswerSchema.safeParse({ title: 'Data analyst', keywords: fifteen }).success).toBe(
      true,
    );
  });

  it.each([
    ['no title', { keywords: ['sql'] }],
    ['an empty title', { title: '  ', keywords: ['sql'] }],
    ['no keyword', { title: 'Data analyst', keywords: [] }],
    ['keywords that are not text', { title: 'Data analyst', keywords: [1, 2] }],
    ['keywords that are not a list', { title: 'Data analyst', keywords: 'sql' }],
  ])('[EF-IA-03] rejects an answer with %s', (_name, answer) => {
    expect(OfferTraitsAnswerSchema.safeParse(answer).success).toBe(false);
  });

  it('[EF-VEI-49] [RG-29] drops the years and the level a model volunteers: the code reads them', () => {
    const parsed = OfferTraitsAnswerSchema.parse({
      title: 'Data analyst',
      keywords: ['sql'],
      years: 12,
      level: 'senior',
    });

    expect(parsed).toEqual({ title: 'Data analyst', keywords: ['sql'] });
  });

  it('[EF-VEI-49] cuts a title a little too long instead of refusing the answer, and keeps the first fifteen keywords', () => {
    const parsed = OfferTraitsAnswerSchema.parse({
      title: `  ${'x'.repeat(90)}  `,
      keywords: Array.from({ length: 20 }, (_u, i) => `mot${String(i)}`),
    });

    expect(parsed.title).toHaveLength(80);
    expect(parsed.keywords).toHaveLength(15);
  });

  it('[EF-VEI-49] drops a keyword that is empty, too long or not text, and refuses an answer with none left', () => {
    const answer = { title: 'Data analyst', keywords: ['sql', '', 4, 'y'.repeat(61)] };

    expect(OfferTraitsAnswerSchema.parse(answer).keywords).toEqual(['sql']);
    expect(OfferTraitsAnswerSchema.safeParse({ title: 'Data analyst', keywords: ['', 4] }).success).toBe(
      false,
    );
  });

  it('[EF-VEI-49] keeps each keyword once, whatever its case', () => {
    const parsed = OfferTraitsAnswerSchema.parse({ title: 'Data analyst', keywords: ['SQL', 'sql', 'dbt'] });

    expect(parsed.keywords).toEqual(['SQL', 'dbt']);
  });
});

describe('suggestedLevelOf', () => {
  it.each([
    [0, 'Data analyst', 'junior'],
    [2, 'Data analyst', 'junior'],
    [3, 'Data analyst', 'confirme'],
    [5, 'Data analyst', 'confirme'],
    [7, 'Data analyst', 'confirme'],
    [8, 'Data analyst', 'senior'],
  ])('[RG-28] gives %i years the level %s… %s', (years, title, level) => {
    expect(suggestedLevelOf({ years, title })).toBe(level);
  });

  it('[RG-28] reads the level in the title when the offer demands no years', () => {
    expect(suggestedLevelOf({ years: null, title: 'Data engineer senior' })).toBe('senior');
    expect(suggestedLevelOf({ years: null, title: 'Analyste débutant' })).toBe('junior');
  });

  it('[RG-28] lets the years win over the word of the title', () => {
    expect(suggestedLevelOf({ years: 1, title: 'Data engineer senior' })).toBe('junior');
  });

  it('[RG-28] says nothing when neither the years nor the title tell', () => {
    expect(suggestedLevelOf({ years: null, title: 'Data analyst' })).toBeNull();
  });
});
