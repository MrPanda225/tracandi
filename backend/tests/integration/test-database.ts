import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const DEFAULTS = {
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '5432',
  TEST_DB_NAME: 'tracandi_test',
  TEST_DB_USER: 'tracandi_test',
  TEST_DB_PASSWORD: 'tracandi_test',
};
type TestDbKey = keyof typeof DEFAULTS;

// Only TEST_DB_* are read from .env: the test process never sees the Neon URLs nor the API keys.
const readTestSettings = (): Record<TestDbKey, string> => {
  const fromFile = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
  const pick = (key: TestDbKey) => process.env[key] || fromFile[key] || DEFAULTS[key];
  return Object.fromEntries((Object.keys(DEFAULTS) as TestDbKey[]).map((key) => [key, pick(key)])) as Record<
    TestDbKey,
    string
  >;
};

/**
 * Connection string of the LOCAL test database (docker compose up -d db). Refuses any non-loopback host,
 * so that integration tests can never run against Neon.
 */
export const testDatabaseUrl = (): string => {
  const settings = readTestSettings();
  if (!['127.0.0.1', 'localhost'].includes(settings.TEST_DB_HOST)) {
    throw new Error('TEST_DB_HOST must be the local test database (127.0.0.1)');
  }
  const user = encodeURIComponent(settings.TEST_DB_USER);
  const password = encodeURIComponent(settings.TEST_DB_PASSWORD);
  return `postgresql://${user}:${password}@${settings.TEST_DB_HOST}:${settings.TEST_DB_PORT}/${settings.TEST_DB_NAME}`;
};
