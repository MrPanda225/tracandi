import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CandidateProfileSchema } from './schemas.js';

// The anonymised profile of the fixtures: the real one is never read, in a test or anywhere else (CLAUDE.md).
const EXAMPLE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../tests/fixtures/profile.example.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, unknown>;

const withCvSource = (changes: Record<string, unknown>) => ({
  ...EXAMPLE,
  cvSource: { ...(EXAMPLE['cvSource'] as Record<string, unknown>), ...changes },
});

describe('CandidateProfileSchema', () => {
  it('[EF-CVX-01] accepts the reference profile of the fixtures', () => {
    const parsed = CandidateProfileSchema.parse(EXAMPLE);

    expect(parsed.identity.name).toBe('Alex MARTIN');
    expect(parsed.targets).toHaveLength(3);
    expect(parsed.cvSource.experiences[0]?.company).toBe('Boulangerie Exemple');
  });

  it('[EF-CVX-02] reads an absent optional field as absent, whatever the way it is left out', () => {
    const parsed = CandidateProfileSchema.parse({
      ...EXAMPLE,
      identity: { ...(EXAMPLE['identity'] as Record<string, unknown>), extra: '   ' },
    });

    expect(parsed.identity.extra).toBeNull();
    // The fixture leaves the place of a degree at null: it stays null, it is not invented.
    expect(parsed.cvSource.education[1]?.place).toBe('Abidjan');
  });

  it.each([
    ['an identity without a name', { identity: { city: 'Lyon', phone: '06', email: 'a@b.fr' } }],
    ['an email that is not one', { identity: { ...(EXAMPLE['identity'] as object), email: 'pas-un-email' } }],
    ['no target at all', { targets: [] }],
    ['a target without any keyword', { targets: [{ label: 'Data', contractTypes: ['cdi'], keywords: [] }] }],
    [
      'a contract type outside RG-09',
      { targets: [{ label: 'Data', contractTypes: ['stage'], keywords: ['data'] }] },
    ],
  ])('[EF-CVX-02] refuses %s', (_case, changes) => {
    expect(CandidateProfileSchema.safeParse({ ...EXAMPLE, ...changes }).success).toBe(false);
  });

  it.each([
    ['no experience at all', { experiences: [] }],
    ['no education at all', { education: [] }],
    ['no skill at all', { skills: [] }],
    [
      'an experience without its dates',
      { experiences: [{ company: 'X', role: 'Y', bullets: ['a'], place: null, duration: null }] },
    ],
    [
      'an experience without anything to say',
      {
        experiences: [{ dates: '2024', company: 'X', role: 'Y', place: null, duration: null, bullets: [] }],
      },
    ],
  ])('[EF-CVX-02] [RG-12] refuses a CV source with %s', (_case, changes) => {
    expect(CandidateProfileSchema.safeParse(withCvSource(changes)).success).toBe(false);
  });

  it('[EF-CVX-02] refuses a field the schema does not know, rather than keeping it', () => {
    expect(CandidateProfileSchema.safeParse({ ...EXAMPLE, secretNotes: 'à ne pas garder' }).success).toBe(
      false,
    );
  });

  it('[ENF-SEC-04] refuses a text longer than the profile allows', () => {
    const parsed = CandidateProfileSchema.safeParse({
      ...EXAMPLE,
      availability: 'x'.repeat(501),
    });

    expect(parsed.success).toBe(false);
  });
});
