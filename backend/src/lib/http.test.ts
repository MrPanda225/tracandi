import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ValidationError } from './errors.js';
import { asyncHandler, validate } from './http.js';

const fakeRequest = (parts: Partial<Pick<Request, 'body' | 'query' | 'params'>>) =>
  ({ body: undefined, query: {}, params: {}, ...parts }) as Request;

describe('validate', () => {
  const schemas = {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ note: z.string().max(5) }).strict(),
  };

  it('[ENF-SEC-04] returns the parsed and typed parts of a valid request', () => {
    const parsed = validate(fakeRequest({ params: { id: '12' }, body: { note: 'ok' } }), schemas);

    expect(parsed).toEqual({ params: { id: 12 }, body: { note: 'ok' } });
  });

  it('[ENF-SEC-04] throws a ValidationError listing each invalid field', () => {
    const invalid = fakeRequest({ params: { id: '-1' }, body: { note: 'too long', extra: true } });

    expect(() => validate(invalid, schemas)).toThrow(ValidationError);
    try {
      validate(invalid, schemas);
    } catch (error) {
      const details = (error as ValidationError).details.map((detail) => detail.path);
      expect(details).toEqual(expect.arrayContaining(['params.id', 'body.note', 'body']));
    }
  });

  it('[ENF-SEC-04] reports only the bound of the schema for an integer beyond the safe range', () => {
    const request = fakeRequest({ params: { id: '1e20' } });
    const bounded = { params: z.object({ id: z.coerce.number().int().max(2_147_483_647) }) };

    expect(() => validate(request, bounded)).toThrow(ValidationError);
    try {
      validate(request, bounded);
    } catch (error) {
      expect((error as ValidationError).details).toEqual([
        { path: 'params.id', message: expect.stringContaining('2147483647') as string },
      ]);
    }
  });
});

describe('asyncHandler', () => {
  it('[ENF-SEC-04] forwards a rejected promise to the error middleware', async () => {
    const failure = new Error('boom');
    const next = vi.fn<(error?: unknown) => void>();
    const handler = asyncHandler(() => Promise.reject(failure));

    handler(fakeRequest({}), {} as Response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(failure));
  });
});
