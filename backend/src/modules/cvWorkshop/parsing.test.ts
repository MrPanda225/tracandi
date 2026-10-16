import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LlmUnavailableError } from '../../lib/errors.js';
import type { LlmRouter, RunTaskInput } from '../../llm/router.js';
import { parseCv } from './parsing.js';

const ANSWER: unknown = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/llm/parse_cv.json', import.meta.url), 'utf8'),
);
const CV = [
  'Data Analyst confirmé',
  'Analyste de données avec trois ans',
  'd’expérience en tableaux de bord',
  '',
  'Data Analyst – Atelier Nova',
  'Paris, France | 09/2021 – 06/2023',
  'Création de 12 tableaux de bord Power BI',
  'Automatisation de rapports avec Python',
  '',
  'Master Informatique – Université de Lyon',
  '2019 – 2021',
  'SQL, Python',
  'Anglais courant',
].join('\n');

const routerAnswering = (answer: unknown) => {
  const runTask = vi.fn(<T>(_task: string, input: RunTaskInput<T>) =>
    Promise.resolve({ data: input.schema.parse(answer), provider: 'groq_1' as const }),
  );
  return { router: { runTask } as unknown as LlmRouter, runTask };
};

describe('parseCv', () => {
  it('[EF-CVX-46] [RG-21] runs parse_cv on the numbered lines and anchors the answer on the source', async () => {
    const { router, runTask } = routerAnswering(ANSWER);

    const cv = await parseCv(router, { userId: 7, text: CV });

    expect(runTask).toHaveBeenCalledWith('parse_cv', expect.objectContaining({ userId: 7 }));
    expect(runTask.mock.calls[0]?.[1].prompt).toContain('L1: Data Analyst confirmé');
    expect(cv).toEqual({
      headline: 'Data Analyst confirmé',
      profile: 'Analyste de données avec trois ans d’expérience en tableaux de bord',
      experiences: [
        {
          id: 'exp_0',
          title: 'Data Analyst',
          organization: 'Atelier Nova',
          place: 'Paris',
          dates: '09/2021 – 06/2023',
          bullets: [
            { id: 'exp_0.b0', text: 'Création de 12 tableaux de bord Power BI' },
            { id: 'exp_0.b1', text: 'Automatisation de rapports avec Python' },
          ],
        },
      ],
      education: [
        {
          id: 'edu_0',
          degree: 'Master Informatique',
          school: 'Université de Lyon',
          place: null,
          dates: '2019 – 2021',
          details: [],
        },
      ],
      skills: [
        { id: 'skill_0', text: 'SQL' },
        { id: 'skill_1', text: 'Python' },
      ],
      certifications: [],
      languages: [{ id: 'lang_0', text: 'Anglais courant' }],
      interests: [],
      dropped: 0,
    });
  });

  it('[EF-CVX-46] lets LlmUnavailableError through', async () => {
    const router = { runTask: () => Promise.reject(new LlmUnavailableError(true)) } as unknown as LlmRouter;

    await expect(parseCv(router, { userId: 1, text: CV })).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});
