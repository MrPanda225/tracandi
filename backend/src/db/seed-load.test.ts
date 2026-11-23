import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, DEFAULT_USERS } from './loadDataset.js';
import { assertLocalDatabase, readSeedLoadRequest } from './seed-load.js';

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
});
