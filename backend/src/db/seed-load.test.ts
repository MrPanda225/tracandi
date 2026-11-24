import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, DEFAULT_USERS } from './loadDataset.js';
import { assertLocalDatabase, MAX_LOAD_USERS, readSeedLoadRequest } from './seed-load.js';

const LOCAL = 'postgresql://tracandi_test:tracandi_test@127.0.0.1:5432/tracandi_recette';

describe('assertLocalDatabase', () => {
  it.each([LOCAL, 'postgres://u:p@localhost/db', 'postgresql://u:p@[::1]:5432/db'])(
    '[ENF-PERF-01] accepts the local database %s',
    (url) => {
      expect(() => assertLocalDatabase(url)).not.toThrow();
    },
  );

  it.each([
    'postgresql://u:secret@ep-cool-name.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full',
    'postgresql://u:secret@192.168.1.20/db',
    'mysql://u:secret@127.0.0.1/db',
    'pas une adresse',
  ])('[ENF-PERF-01] refuses %s, without repeating its password', (url) => {
    expect(() => assertLocalDatabase(url)).toThrow(/LOAD_DATABASE_URL/u);
    expect(() => assertLocalDatabase(url)).not.toThrow(/secret/u);
  });

  // pg-connection-string copies the query into the connection settings and prefers it to the host of the URL.
  it.each([
    ['host', `${LOCAL}?host=ep-x.eu-central-1.aws.neon.tech&sslmode=require`],
    ['host', 'postgresql://u:secret@127.0.0.1:5432/neondb?sslmode=require&host=ep-x.eu-central-1.aws.neon.tech'],
    ['host', `${LOCAL}?ho%73t=ep-x.eu-central-1.aws.neon.tech`],
    ['hostaddr', `${LOCAL}?hostaddr=203.0.113.7`],
    ['port', `${LOCAL}?port=6543`],
    ['service', `${LOCAL}?service=neon`],
    ['options', `${LOCAL}?options=-c%20search_path%3Dother`],
  ])('[ENF-PERF-01] refuses the query parameter %s, which could change the target: %s', (name, url) => {
    expect(() => assertLocalDatabase(url)).toThrow(new RegExp(`LOAD_DATABASE_URL.*"${name}"`, 'u'));
    expect(() => assertLocalDatabase(url)).not.toThrow(/secret|neon\.tech|203\.0/u);
  });

  it('[ENF-PERF-01] accepts sslmode, the only query parameter that cannot change the target', () => {
    expect(() => assertLocalDatabase(`${LOCAL}?sslmode=disable`)).not.toThrow();
  });
});

describe('readSeedLoadRequest', () => {
  it('[ENF-PERF-01] reads the URL from the environment and keeps the default seed and number of users', () => {
    expect(readSeedLoadRequest([], { LOAD_DATABASE_URL: LOCAL })).toEqual({
      url: LOCAL,
      seed: DEFAULT_SEED,
      users: DEFAULT_USERS,
      email: undefined,
    });
  });

  it('[ENF-PERF-01] reads the options', () => {
    expect(
      readSeedLoadRequest(['--seed', '42', '--users', '5', '--email', 'testeuse@example.test'], {
        LOAD_DATABASE_URL: LOCAL,
      }),
    ).toEqual({ url: LOCAL, seed: 42, users: 5, email: 'testeuse@example.test' });
  });

  it('[ENF-PERF-01] refuses a missing URL and an option that is not a positive integer', () => {
    expect(() => readSeedLoadRequest([], {})).toThrow(/LOAD_DATABASE_URL/u);
    expect(() => readSeedLoadRequest(['--users', '0'], { LOAD_DATABASE_URL: LOCAL })).toThrow(/--users/u);
    expect(() => readSeedLoadRequest(['--seed', 'abc'], { LOAD_DATABASE_URL: LOCAL })).toThrow(/--seed/u);
  });

  it('[ENF-PERF-01] bounds the number of users', () => {
    const at = (count: number) => readSeedLoadRequest(['--users', String(count)], { LOAD_DATABASE_URL: LOCAL });
    expect(at(MAX_LOAD_USERS).users).toBe(MAX_LOAD_USERS);
    expect(() => at(MAX_LOAD_USERS + 1)).toThrow(`--users must be at most ${String(MAX_LOAD_USERS)}`);
  });
});
