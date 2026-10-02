import { describe, expect, it } from 'vitest';
import { FREE_PROVIDERS, isFreeProvider } from './pricing.js';

describe('isFreeProvider', () => {
  it('[ENF-COU-02] reads the local model as free, so that its calls cost 0 € and stay out of the monthly 10 €', () => {
    expect(isFreeProvider('local')).toBe(true);
    expect([...FREE_PROVIDERS]).toEqual(['local']);
  });

  it.each(['claude', 'gemini', 'groq_1', 'groq_2', 'groq_3'] as const)(
    '[ENF-COU-01] does not read %s as free: its calls stay counted',
    (provider) => {
      expect(isFreeProvider(provider)).toBe(false);
    },
  );
});
