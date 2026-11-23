import { describe, expect, it } from 'vitest';
import { z } from './openapi.js';

const messagesOf = (schema: z.ZodType, input: unknown): string[] => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('zod3Messages', () => {
  it('[ENF-SEC-04] keeps the zod 3 wording of a missing or mistyped field', () => {
    expect(messagesOf(z.object({ name: z.string() }), {})).toEqual(['Required']);
    expect(messagesOf(z.string(), 42)).toEqual(['Expected string, received number']);
    expect(messagesOf(z.object({}), null)).toEqual(['Expected object, received null']);
    expect(messagesOf(z.array(z.string()), {})).toEqual(['Expected array, received object']);
    expect(messagesOf(z.coerce.number(), 'abc')).toEqual(['Expected number, received nan']);
    expect(messagesOf(z.number().int(), 1.5)).toEqual(['Expected integer, received float']);
  });

  it('[ENF-SEC-04] keeps the zod 3 wording of a length or a bound', () => {
    expect(messagesOf(z.string().min(1), '')).toEqual(['String must contain at least 1 character(s)']);
    expect(messagesOf(z.string().max(2), 'abc')).toEqual(['String must contain at most 2 character(s)']);
    expect(messagesOf(z.string().length(2), 'a')).toEqual(['String must contain exactly 2 character(s)']);
    expect(messagesOf(z.array(z.string()).min(1), [])).toEqual(['Array must contain at least 1 element(s)']);
    expect(messagesOf(z.array(z.string()).max(1), ['a', 'b'])).toEqual(['Array must contain at most 1 element(s)']);
    expect(messagesOf(z.number().min(5), 1)).toEqual(['Number must be greater than or equal to 5']);
    expect(messagesOf(z.number().positive(), 0)).toEqual(['Number must be greater than 0']);
    expect(messagesOf(z.number().max(10), 11)).toEqual(['Number must be less than or equal to 10']);
    expect(messagesOf(z.number().lt(10), 10)).toEqual(['Number must be less than 10']);
    expect(messagesOf(z.number().multipleOf(5), 7)).toEqual(['Number must be a multiple of 5']);
  });

  it('[ENF-SEC-04] keeps the zod 3 wording of an enum, a literal and a format', () => {
    expect(messagesOf(z.enum(['cdi', 'cdd']), 'stage')).toEqual([
      "Invalid enum value. Expected 'cdi' | 'cdd', received 'stage'",
    ]);
    expect(messagesOf(z.enum(['cdi', 'cdd']), 3)).toEqual(["Expected 'cdi' | 'cdd', received number"]);
    expect(messagesOf(z.object({ kind: z.enum(['cdi']) }), {})).toEqual(['Required']);
    expect(messagesOf(z.literal('ok'), 'ko')).toEqual(['Invalid literal value, expected "ok"']);
    expect(messagesOf(z.email(), 'nope')).toEqual(['Invalid email']);
    expect(messagesOf(z.url(), 'nope')).toEqual(['Invalid url']);
    expect(messagesOf(z.iso.datetime(), 'nope')).toEqual(['Invalid datetime']);
    expect(messagesOf(z.string().regex(/^\d+$/), 'a')).toEqual(['Invalid']);
    expect(messagesOf(z.string().startsWith('ab'), 'b')).toEqual(['Invalid input: must start with "ab"']);
    expect(messagesOf(z.string().endsWith('ab'), 'b')).toEqual(['Invalid input: must end with "ab"']);
    expect(messagesOf(z.string().includes('ab'), 'b')).toEqual(['Invalid input: must include "ab"']);
  });

  it('[ENF-SEC-04] keeps the zod 3 wording of unknown keys, unions and refinements', () => {
    expect(messagesOf(z.object({}).strict(), { a: 1, b: 2 })).toEqual(["Unrecognized key(s) in object: 'a', 'b'"]);
    expect(messagesOf(z.union([z.string(), z.number()]), true)).toEqual(['Invalid input']);
    expect(messagesOf(z.string().refine(() => false), 'a')).toEqual(['Invalid input']);
  });

  it('[ENF-SEC-04] leaves the message a schema gives untouched', () => {
    expect(messagesOf(z.string().min(1, 'Champ obligatoire'), '')).toEqual(['Champ obligatoire']);
    expect(messagesOf(z.string().regex(/^\d+$/, 'Chiffres seulement'), 'a')).toEqual(['Chiffres seulement']);
  });
});
