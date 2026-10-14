import { describe, expect, it } from 'vitest';
import { cites, foldText, figuresIn, sentencesOf } from './text.js';

describe('foldText and cites (RG-21)', () => {
  it('[RG-21] reads the ligatures of a PDF as their letters', () => {
    expect(cites(foldText('Conﬁguration des ﬂux, Certiﬁcation oﬃcielle'), 'Configuration')).toBe(true);
    expect(cites(foldText('Certiﬁcation AWS'), 'certification')).toBe(true);
    expect(cites(foldText('Conﬁguration'), 'Configuration')).toBe(true);
    expect(foldText('ﬀ ﬃ ﬄ ﬅ ﬆ')).toBe('ff ffi ffl st st');
  });

  it('[RG-21] ignores the invisible characters a PDF leaves in a word', () => {
    expect(foldText('Data­base Ana​lyst‌‍⁠﻿')).toBe('database analyst');
  });

  it('[RG-21] reads the typographic apostrophes as one', () => {
    for (const mark of ['’', '‘', 'ʼ', '´', '′', '`']) expect(foldText(`l${mark}équipe`)).toBe("l'equipe");
  });

  it('[RG-21] reads the minus sign among the dashes of a date', () => {
    expect(cites(foldText('2022 − 2023'), '2022 - 2023')).toBe(true);
  });

  it('[RG-21] leaves the figures of the raw text alone', () => {
    expect(figuresIn('m² et ½ en 2024')).toEqual(['2024']);
  });

  it('[RG-21] reads « 10 000 », « 10000 » and « 10.000 » as one figure, and « 09 » as « 9 »', () => {
    expect(figuresIn('10 000 euros')).toEqual(['10000']);
    expect(figuresIn('10000 et 10.000 et 2 000 000')).toEqual(['10000', '10000', '2000000']);
    expect(figuresIn('de 09/2021 à 3,5')).toEqual(['9', '2021', '3', '5']);
    expect(figuresIn('2021 2023')).toEqual(['2021', '2023']);
  });

  it('[RG-21] splits a paragraph into sentences', () => {
    expect(sentencesOf('Un. Deux ! Trois ? Quatre')).toEqual(['Un.', 'Deux !', 'Trois ?', 'Quatre']);
    expect(sentencesOf('')).toEqual([]);
  });
});
