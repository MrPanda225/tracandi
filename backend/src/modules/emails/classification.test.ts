import { describe, expect, it } from 'vitest';
import { ClassificationSchema } from './classification.js';

const valid = {
  ref: 1,
  category: 'acknowledged',
  employer: 'Innova Solutions',
  platform: 'APEC',
  jobTitle: 'Data analyst',
  contractType: 'alternance',
};

describe('ClassificationSchema', () => {
  it('[EF-GML-08] [EF-IA-03] accepts one classified message per reference', () => {
    expect(ClassificationSchema.parse({ messages: [valid] })).toEqual({ messages: [valid] });
  });

  it('[EF-GML-08] [EF-IA-03] refuses a category outside the list', () => {
    expect(ClassificationSchema.safeParse({ messages: [{ ...valid, category: 'spam' }] }).success).toBe(
      false,
    );
  });

  it('[EF-GML-19] [EF-IA-03] refuses a contract type outside the glossary', () => {
    expect(ClassificationSchema.safeParse({ messages: [{ ...valid, contractType: 'stage' }] }).success).toBe(
      false,
    );
  });

  it('[EF-IA-03] reads an empty or blank name as absent', () => {
    const parsed = ClassificationSchema.parse({
      messages: [{ ...valid, employer: '  ', platform: '', jobTitle: null }],
    });

    expect(parsed.messages[0]).toMatchObject({ employer: null, platform: null, jobTitle: null });
  });

  it('[EF-IA-03] refuses names longer than the data model allows', () => {
    expect(
      ClassificationSchema.safeParse({ messages: [{ ...valid, employer: 'x'.repeat(161) }] }).success,
    ).toBe(false);
  });
});
