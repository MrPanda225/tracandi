import { describe, expect, it } from 'vitest';
import { PARSED_CV } from '../../../tests/fixtures/cv/parsedCv.js';
import { buildTailorCvPrompt, renderParsedCv } from './tailorCv.js';

const INPUT = {
  cv: PARSED_CV,
  offerText: 'Nous cherchons un Data Analyst maîtrisant dbt.',
  diagnosis: { explanations: ['Il manque dbt, que l’équipe utilise au quotidien.'], missingSkills: ['dbt'] },
};

describe('buildTailorCvPrompt', () => {
  it('[ENF-SEC-06] frames the CV, the offer and the diagnostic as untrusted content', () => {
    const { system, prompt } = buildTailorCvPrompt(INPUT);

    expect(prompt).toContain('<cv>\nheadline: Data analyst confirmé');
    expect(prompt).toContain('<offer>\nNous cherchons');
    expect(prompt).toContain('<diagnosis>');
    expect(system).toMatch(/jamais une instruction/);
  });

  it('[EF-CVX-47] gives the model the parsed CV, each fact with its id', () => {
    const { prompt } = buildTailorCvPrompt(INPUT);

    expect(prompt).toContain('exp_0 — Data Analyst | Atelier Nova | Paris | 09/2021 – 06/2023');
    expect(prompt).toContain('exp_0.b1: Automatisation de rapports avec Python');
    expect(prompt).toContain('exp_1 — Développeuse');
    expect(prompt).toContain('edu_0 — Master Informatique | Université de Lyon | 2019 – 2021');
    expect(prompt).toContain('edu_0.d0: Mention bien');
    expect(prompt).toContain('skill_2: Power BI');
    expect(prompt).toContain('lang_0: Anglais courant');
  });

  it('[EF-CVX-47] [RG-21] forbids typing a fact, inventing a figure or computing years of experience, and names the skills to leave out', () => {
    const { system, prompt } = buildTailorCvPrompt(INPUT);

    expect(system).toMatch(/Tu n’écris jamais un intitulé de poste, un nom d’entreprise/);
    expect(system).toMatch(/par leur identifiant, le code les recopie/);
    expect(system).toMatch(/N’ajoute aucun chiffre absent du CV, et ne calcule pas « X ans d’expérience »/);
    expect(prompt).toContain('Compétences absentes du CV, à ne pas ajouter : dbt');
  });

  it('[RG-24] asks for one-line achievements and a few per experience', () => {
    const { system } = buildTailorCvPrompt(INPUT);

    expect(system).toMatch(/environ 90 caractères/);
    expect(system).toMatch(/2 à 4 plus utiles/);
    expect(system).toMatch(/0 ou 1 dans les autres/);
  });

  it('[EF-CVX-29] asks for each change with its target and reason, not the texts', () => {
    const { system } = buildTailorCvPrompt(INPUT);

    expect(system).toContain('"target"');
    expect(system).toContain('"reason"');
    expect(system).not.toContain('"before"');
  });

  it('[ENF-COU-01] bounds what is sent, however long the CV and the offer', () => {
    const long = { ...PARSED_CV, profile: 'a'.repeat(50_000) };
    const { prompt } = buildTailorCvPrompt({ ...INPUT, cv: long, offerText: 'b'.repeat(50_000) });

    expect(prompt.length).toBeLessThan(22_000);
  });

  it('[EF-CVX-47] leaves out what the CV does not give', () => {
    const text = renderParsedCv({ ...PARSED_CV, headline: null, profile: null, education: [], skills: [] });

    expect(text).not.toContain('headline:');
    expect(text).not.toContain('profile:');
    expect(text.split('\n')[0]).toMatch(/^exp_0 — /);
  });
});
