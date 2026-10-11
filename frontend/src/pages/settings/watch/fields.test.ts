import { describe, expect, it } from 'vitest';
import { describeKeywordsProblem, describeLabelProblem, keywordsOf } from './fields';

describe('keywordsOf', () => {
  it('[EF-VEI-45] splits on commas, trims, and drops what is empty', () => {
    expect(keywordsOf(' data , sql,, python ,')).toEqual(['data', 'sql', 'python']);
  });

  it('[EF-VEI-45] keeps a keyword once, whatever its case, as the API does', () => {
    expect(keywordsOf('SQL, sql, Python, python')).toEqual(['SQL', 'Python']);
  });
});

describe('describeLabelProblem', () => {
  it('[EF-VEI-45] accepts a label of 1 to 80 characters', () => {
    expect(describeLabelProblem('Data analyst')).toBeNull();
    expect(describeLabelProblem('x'.repeat(80))).toBeNull();
  });

  it('[EF-VEI-45] refuses an empty label and one of 81 characters', () => {
    expect(describeLabelProblem('   ')).toBe('Indiquez un intitulé.');
    expect(describeLabelProblem('x'.repeat(81))).toBe(
      'L’intitulé dépasse 80 caractères : gardez l’essentiel.',
    );
  });
});

describe('describeKeywordsProblem', () => {
  it('[EF-VEI-45] accepts from 1 to 15 keywords', () => {
    expect(describeKeywordsProblem(['data'])).toBeNull();
    expect(
      describeKeywordsProblem(Array.from({ length: 15 }, (_, index) => `mot${String(index)}`)),
    ).toBeNull();
  });

  it('[EF-VEI-45] refuses none, sixteen, and a keyword of 61 characters', () => {
    expect(describeKeywordsProblem([])).toBe('Indiquez au moins un mot-clé.');
    expect(describeKeywordsProblem(Array.from({ length: 16 }, (_, index) => `mot${String(index)}`))).toBe(
      'Gardez 15 mots-clés au plus.',
    );
    expect(describeKeywordsProblem(['x'.repeat(61)])).toBe('Un mot-clé dépasse 60 caractères.');
  });
});
