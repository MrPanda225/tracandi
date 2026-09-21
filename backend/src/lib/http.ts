import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ValidationError, type ValidationIssue } from './errors.js';

type RequestPart = 'params' | 'query' | 'body';

/** Zod schema for each request part to validate; parts without a schema are not read. */
export type RequestSchemas = Partial<Record<RequestPart, z.ZodTypeAny>>;

/** Parsed request parts, typed from their schemas. */
export type ValidatedRequest<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodTypeAny ? z.infer<S[K]> : never;
};

const toIssues = (part: RequestPart, error: z.ZodError): ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: [part, ...issue.path].join('.'),
    message: issue.message,
  }));

/**
 * Parses `params`, `query` and `body` with their schemas and returns the typed values (ENF-SEC-04).
 * Only the parts listed in `schemas` are returned, so unvalidated input can never reach a service.
 * @throws ValidationError (400) listing every invalid field of every part.
 * @req ENF-SEC-04
 */
export const validate = <S extends RequestSchemas>(req: Request, schemas: S): ValidatedRequest<S> => {
  const parsed: Partial<Record<RequestPart, unknown>> = {};
  const issues: ValidationIssue[] = [];
  for (const part of Object.keys(schemas) as RequestPart[]) {
    const result = schemas[part]?.safeParse(req[part]);
    if (result?.success) parsed[part] = result.data as unknown;
    else if (result) issues.push(...toIssues(part, result.error));
  }
  if (issues.length > 0) throw new ValidationError(issues);
  return parsed as ValidatedRequest<S>;
};

/**
 * Wraps an async route handler so that a rejected promise reaches the central error handler
 * (Express 4 does not do it by itself).
 * @req ENF-SEC-08
 */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
