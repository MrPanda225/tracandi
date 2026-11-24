import { describe, expect, it } from 'vitest';
import { cites, datesIn, durationsIn, foldText, figuresIn, sentencesOf } from './text.js';

describe('foldText and cites (RG-21)', () => {
  it('[RG-21] reads the ligatures of a PDF as their letters', () => {
    expect(cites('Conﬁguration des ﬂux, Certiﬁcation oﬃcielle', 'Configuration')).toBe(true);
    expect(cites('Certiﬁcation AWS', 'certification')).toBe(true);
    expect(cites('Conﬁguration', 'Configuration')).toBe(true);
    expect(foldText('ﬀ ﬃ ﬄ ﬅ ﬆ')).toBe('ff ffi ffl st st');
  });

  it('[RG-21] ignores the invisible characters a PDF leaves in a word', () => {
    expect(foldText('Data­base Ana​lyst‌‍⁠﻿')).toBe('database analyst');
  });

  it('[RG-21] reads the typographic apostrophes as one', () => {
    for (const mark of ['’', '‘', 'ʼ', '´', '′', '`']) expect(foldText(`l${mark}équipe`)).toBe("l'equipe");
  });

  it.each([
    ['C’est avec rigueur que j’ai mené le projet.', 'C'],
    ['Préparation du go-live.', 'Go'],
    ['Préparation du go–live.', 'Go'],
    ['Budget de R&D suivi chaque mois.', 'R'],
    ['Budget de R&D suivi chaque mois.', 'D'],
  ])('[RG-21] does not read a short skill as a piece of another word: « %s » for « %s »', (text, skill) => {
    expect(cites(text, skill)).toBe(false);
  });

  it.each([
    ['Développement en C, puis en Python.', 'C'],
    ['Développement en C.', 'C'],
    ['Modèles en R.', 'R'],
    ['Services écrits en Go, R et C#', 'Go'],
    ['Services écrits en Go, R et C#', 'R'],
    ['Services écrits en Go, R et C#', 'C#'],
    ['Services Go/Rust', 'Go'],
    ['Langages C/C++', 'C'],
    ['Langage (C)', 'C'],
    ['Langage « R »', 'R'],
    ['C - Python - SQL', 'C'],
    ['Norme C-11', 'C'],
    ['R: modèles statistiques', 'R'],
    ['Go! en production', 'Go'],
    ['Services en C#.', 'C#'],
    ['Python/R', 'R'],
    ['Applications R-Shiny pour la direction', 'R'],
    ['Python-R-SQL', 'R'],
    ['C-Python-SQL', 'C'],
    ['C–Python', 'C'],
    ['Conception UX-UI', 'UX'],
    ['Tableaux BI-métier', 'BI'],
    ['Chaîne ML-Ops', 'ML'],
    ['Projets IA-générative', 'IA'],
    ['Services Go-lang', 'Go'],
    ['Services Go&Rust', 'Go'],
    ['Analyses Python&R', 'R'],
    ['Le langage ‘Go’', 'Go'],
    // Each occurrence is judged on its own: an excluded one never hides a later citation.
    ["C’est écrit en C.", 'C'],
    ['Préparation du go-live, services en Go', 'Go'],
  ])('[RG-21] reads a short skill written as a word: « %s » cites « %s »', (text, skill) => {
    expect(cites(text, skill)).toBe(true);
  });

  it('[RG-21] keeps reading a longer skill inside a hyphenated word', () => {
    expect(cites('Migration Power BI-Fabric', 'Power BI')).toBe(true);
  });

  it('[RG-21] reads the minus sign among the dashes of a date', () => {
    expect(cites('2022 − 2023', '2022 - 2023')).toBe(true);
  });

  it('[RG-21] leaves the figures of the raw text alone', () => {
    expect(figuresIn('m² et ½ en 2024')).toEqual(['2024']);
  });

  it('[RG-21] reads « 10 000 », « 10000 » and « 10.000 » as one figure, and « 09 » as « 9 »', () => {
    expect(figuresIn('10 000 euros')).toEqual(['10000']);
    expect(figuresIn('10000 et 10.000 et 2 000 000')).toEqual(['10000', '10000', '2000000']);
    expect(figuresIn('de 09 à 3,5')).toEqual(['9', '3', '5']);
    expect(figuresIn('2021 2023')).toEqual(['2021', '2023']);
  });

  it('[EF-CVX-47] [RG-21] counts neither the month nor the day of a date as a figure, only its year', () => {
    expect(figuresIn('de 05/2019 à 03-2023, le 12/05/2020')).toEqual(['2019', '2023', '2020']);
    expect(figuresIn('Bac+5, 2019-2023')).toEqual(['5', '2019', '2023']);
    expect(datesIn('05/2019 – 3-2023, le 12/05/2020, 2021')).toEqual(['5/2019', '3/2023', '5/2020']);
  });

  it('[EF-CVX-47] [RG-21] reads the durations in figures and in words, units made one', () => {
    expect(durationsIn('5 ans d’expérience, 5+ ans, cinq années, dix-huit mois, une année, 3 years, 18 months')).toEqual([
      '5 an',
      '5 an',
      'cinq an',
      'dix huit mois',
      'un an',
      '3 an',
      '18 mois',
    ]);
    expect(durationsIn('dans les équipes, deuxième année, 2023')).toEqual([]);
  });

  it('[RG-21] splits a paragraph into sentences', () => {
    expect(sentencesOf('Un. Deux ! Trois ? Quatre')).toEqual(['Un.', 'Deux !', 'Trois ?', 'Quatre']);
    expect(sentencesOf('')).toEqual([]);
  });
});
