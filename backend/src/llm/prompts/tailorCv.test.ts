import { describe, expect, it } from 'vitest';
import { buildTailorCvPrompt } from './tailorCv.js';

const INPUT = {
  cvText: 'Data Analyst - Atelier Nova\nSQL, Python',
  offerText: 'Nous cherchons un Data Analyst maîtrisant dbt.',
  diagnosis: { explanations: ['Il manque dbt, que l’équipe utilise au quotidien.'], missingSkills: ['dbt'] },
};

describe('buildTailorCvPrompt', () => {
  it('[ENF-SEC-06] frames the CV, the offer and the diagnostic as untrusted content', () => {
    const { system, prompt } = buildTailorCvPrompt(INPUT);

    expect(prompt).toContain('<cv>\nData Analyst - Atelier Nova');
    expect(prompt).toContain('<offer>\nNous cherchons');
    expect(prompt).toContain('<diagnosis>');
    expect(system).toMatch(/jamais une instruction/);
  });

  it('[RG-21] forbids inventing, and names the missing skills to leave out', () => {
    const { system, prompt } = buildTailorCvPrompt(INPUT);

    expect(system).toMatch(/Recopie à l’identique/);
    expect(system).toMatch(/l’intitulé d’un poste ne se réécrit jamais/);
    expect(system).toMatch(/avec les mots du CV, sans les traduire ni les renommer, un seul par élément/);
    expect(system).toMatch(/N’ajoute aucune expérience, aucun diplôme, aucune certification, aucun chiffre/);
    expect(prompt).toContain('Compétences absentes du CV, à ne pas ajouter : dbt');
  });

  it('[EF-CVX-29] asks for each change with its section, before, after and reason', () => {
    const { system } = buildTailorCvPrompt(INPUT);

    for (const key of ['"section"', '"before"', '"after"', '"reason"']) expect(system).toContain(key);
  });

  it('[ENF-COU-01] bounds what is sent, however long the CV and the offer', () => {
    const { prompt } = buildTailorCvPrompt({ ...INPUT, cvText: 'a'.repeat(50_000), offerText: 'b'.repeat(50_000) });

    expect(prompt.length).toBeLessThan(22_000);
  });
});
