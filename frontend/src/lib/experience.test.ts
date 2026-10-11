import { describe, expect, it } from 'vitest';
import { levelOfYears, parseYears } from './experience';

describe('levelOfYears', () => {
  it.each([
    [0, 'junior'],
    [2, 'junior'],
    [3, 'confirme'],
    [7, 'confirme'],
    [8, 'senior'],
    [50, 'senior'],
  ])('[RG-28] [EF-VEI-44] gives the level of %i years as %s', (years, level) => {
    expect(levelOfYears(years)).toBe(level);
  });
});

describe('parseYears', () => {
  it.each([
    ['0', 0],
    ['6', 6],
    [' 12 ', 12],
    ['50', 50],
  ])('[EF-VEI-47] reads « %s » as %i years', (text, years) => {
    expect(parseYears(text)).toEqual({ years });
  });

  it('[EF-VEI-47] reads an empty field as no years, which is not a mistake', () => {
    expect(parseYears('')).toEqual({ years: null });
    expect(parseYears('   ')).toEqual({ years: null });
  });

  it.each(['51', '-1', '3,5', '2.5', 'dix', '1e2', '007x'])('[EF-VEI-47] refuses « %s »', (text) => {
    expect(parseYears(text)).toEqual({ problem: 'Indiquez un nombre entier d’années, de 0 à 50.' });
  });
});
