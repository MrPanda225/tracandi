import { describe, expect, it } from 'vitest';
import { isDatabaseUnreachable, isUniqueViolation } from './db-errors.js';

/** A failure as Drizzle hands it over: its own message, the failure of `pg` as its cause. */
const asDrizzleWraps = (cause: Error) =>
  Object.assign(new Error('Failed query: select "id" from "users"\nparams: 1'), { cause });

const pgFailure = (message: string, code?: string) =>
  code === undefined ? new Error(message) : Object.assign(new Error(message), { code });

describe('isUniqueViolation', () => {
  it('[ENF-SEC-04] recognises a unique constraint violation, wrapped or not', () => {
    expect(isUniqueViolation(pgFailure('duplicate key', '23505'))).toBe(true);
    expect(isUniqueViolation(asDrizzleWraps(pgFailure('duplicate key', '23505')))).toBe(true);
    expect(isUniqueViolation(pgFailure('duplicate key', '23502'))).toBe(false);
  });
});

describe('isDatabaseUnreachable', () => {
  it.each([
    ['the pool gave up before a connection', 'timeout exceeded when trying to connect'],
    ['the hosted database dropped the socket', 'Connection terminated unexpectedly'],
    ['the client is no longer usable', 'Client has encountered a connection error and is not queryable'],
    ['the server closed the connection', 'Connection terminated'],
    ['the socket hung up', 'socket hang up'],
    ['the server went away mid-query', 'server closed the connection unexpectedly'],
  ])('[ENF-FIA-01] recognises %s', (_case, message) => {
    expect(isDatabaseUnreachable(asDrizzleWraps(pgFailure(message)))).toBe(true);
  });

  it.each([
    ['the host refuses connections', 'ECONNREFUSED'],
    ['the name does not resolve', 'ENOTFOUND'],
    ['the connection was reset', 'ECONNRESET'],
    ['the administrator shut the server down', '57P01'],
    ['the server is still starting', '57P03'],
  ])('[ENF-FIA-01] recognises %s by its code', (_case, code) => {
    expect(isDatabaseUnreachable(asDrizzleWraps(pgFailure('whatever', code)))).toBe(true);
  });

  it.each([
    [
      'a constraint the database refused',
      pgFailure('duplicate key value violates unique constraint', '23505'),
    ],
    ['a column that does not exist', pgFailure('column "unknown" does not exist', '42703')],
    ['a mistake of the application', new Error('Cannot read properties of undefined')],
  ])('[ENF-SEC-04] leaves %s to the generic 500', (_case, failure) => {
    expect(isDatabaseUnreachable(asDrizzleWraps(failure))).toBe(false);
    expect(isDatabaseUnreachable(failure)).toBe(false);
  });

  it('[ENF-FIA-01] ignores the case of the message', () => {
    expect(isDatabaseUnreachable(pgFailure('CONNECTION TERMINATED UNEXPECTEDLY'))).toBe(true);
  });

  it('[ENF-SEC-04] answers false for anything that is not a failure', () => {
    expect(isDatabaseUnreachable(undefined)).toBe(false);
    expect(isDatabaseUnreachable('connection terminated')).toBe(false);
  });
});
