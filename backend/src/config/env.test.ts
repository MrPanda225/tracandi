import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

const NEON_URL = 'postgresql://app:pw@ep-x-pooler.eu-central-1.aws.neon.tech/tracandi?sslmode=verify-full';
const VALID_ENV = { FRONTEND_ORIGIN: 'http://127.0.0.1:5173', DATABASE_URL_APP: NEON_URL };

describe('loadConfig', () => {
  it('[ENF-SEC-03] reads the configuration from the environment and applies defaults', () => {
    const config = loadConfig(VALID_ENV);

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 4000,
      frontendOrigin: 'http://127.0.0.1:5173',
      databaseUrl: NEON_URL,
      isCookieSecure: true,
    });
  });

  it('[ENF-SEC-03] parses explicit host and port', () => {
    const config = loadConfig({ ...VALID_ENV, HOST: '0.0.0.0', PORT: '8080', COOKIE_SECURE: 'false' });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
    expect(config.isCookieSecure).toBe(false);
  });

  it.each([
    [{ DATABASE_URL_APP: NEON_URL }, 'FRONTEND_ORIGIN'],
    [{ ...VALID_ENV, FRONTEND_ORIGIN: 'not a url' }, 'FRONTEND_ORIGIN'],
    [{ ...VALID_ENV, FRONTEND_ORIGIN: 'http://127.0.0.1:5173/app' }, 'FRONTEND_ORIGIN'],
    [{ ...VALID_ENV, PORT: '70000' }, 'PORT'],
    [{ ...VALID_ENV, HOST: 'my host' }, 'HOST'],
    [{ FRONTEND_ORIGIN: 'http://127.0.0.1:5173' }, 'DATABASE_URL_APP'],
    [{ ...VALID_ENV, COOKIE_SECURE: 'yes' }, 'COOKIE_SECURE'],
  ])('[ENF-SEC-03] rejects an invalid environment (%j) naming %s', (env, variable) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(variable);
  });

  it('[ENF-SEC-08] never echoes the rejected value in the error message', () => {
    const secretLookingValue = 'postgresql://u:s3cret@h/d';

    const env = { ...VALID_ENV, FRONTEND_ORIGIN: secretLookingValue, DATABASE_URL_APP: 'postgresql://u:s3cret@neon.tech/d' };

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).not.toThrow(/s3cret/);
  });

  it('[ENF-SEC-15] refuses a remote database URL without sslmode=verify-full', () => {
    const insecure = NEON_URL.replace('verify-full', 'require');

    expect(() => loadConfig({ ...VALID_ENV, DATABASE_URL_APP: insecure })).toThrow(/verify-full/);
  });
});
