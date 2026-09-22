import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

const NEON_URL = 'postgresql://app:pw@ep-x-pooler.eu-central-1.aws.neon.tech/tracandi?sslmode=verify-full';
// Fictitious keys: the configuration never checks them against a provider.
const ANTHROPIC = { ANTHROPIC_API_KEY: 'sk-ant-test-key', ANTHROPIC_MODEL: 'claude-sonnet-5' };
const GEMINI = { GEMINI_API_KEY: 'gemini-test-key', GEMINI_MODEL: 'gemini-2.5-flash' };
const ENCRYPTION_KEY_HEX = '0123456789abcdef'.repeat(4);
const GOOGLE = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/gmail/callback',
  TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY_HEX,
};
const BASE_ENV = { FRONTEND_ORIGIN: 'http://127.0.0.1:5173', DATABASE_URL_APP: NEON_URL, ...GOOGLE };
const VALID_ENV = { ...BASE_ENV, ...ANTHROPIC, ...GEMINI };

describe('loadConfig', () => {
  it('[ENF-SEC-03] reads the configuration from the environment and applies defaults', () => {
    const config = loadConfig(VALID_ENV);

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 4000,
      frontendOrigin: 'http://127.0.0.1:5173',
      databaseUrl: NEON_URL,
      isCookieSecure: true,
      llm: {
        claude: { apiKey: 'sk-ant-test-key', model: 'claude-sonnet-5' },
        gemini: { apiKey: 'gemini-test-key', model: 'gemini-2.5-flash' },
      },
      gmail: {
        clientId: 'test-client.apps.googleusercontent.com',
        clientSecret: 'google-test-secret',
        redirectUri: 'http://localhost:4000/api/gmail/callback',
        tokenEncryptionKey: Buffer.from(ENCRYPTION_KEY_HEX, 'hex'),
      },
    });
  });

  it.each([
    ['GOOGLE_CLIENT_ID', { ...VALID_ENV, GOOGLE_CLIENT_ID: '' }],
    ['GOOGLE_CLIENT_SECRET', { ...VALID_ENV, GOOGLE_CLIENT_SECRET: undefined }],
    ['GOOGLE_REDIRECT_URI', { ...VALID_ENV, GOOGLE_REDIRECT_URI: 'not a url' }],
    ['TOKEN_ENCRYPTION_KEY', { ...VALID_ENV, TOKEN_ENCRYPTION_KEY: '' }],
    ['TOKEN_ENCRYPTION_KEY', { ...VALID_ENV, TOKEN_ENCRYPTION_KEY: 'ab'.repeat(31) }],
  ])('[EF-GML-01] [ENF-SEC-02] refuses to start without a valid %s', (variable, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(variable);
  });

  it('[ENF-SEC-08] never echoes the Google secret nor the encryption key in the error message', () => {
    const env = { ...VALID_ENV, GOOGLE_REDIRECT_URI: '', TOKEN_ENCRYPTION_KEY: 'secret-looking-key-value' };

    expect(() => loadConfig(env)).not.toThrow(/google-test-secret|secret-looking-key-value/);
  });

  it('[EF-IA-05] starts with the Gemini key alone', () => {
    const config = loadConfig({ ...BASE_ENV, ...GEMINI });

    expect(config.llm).toEqual({ gemini: { apiKey: 'gemini-test-key', model: 'gemini-2.5-flash' } });
  });

  it('[EF-IA-05] starts with the Anthropic key alone, an empty Gemini key counting as absent', () => {
    const config = loadConfig({ ...VALID_ENV, GEMINI_API_KEY: '' });

    expect(config.llm).toEqual({ claude: { apiKey: 'sk-ant-test-key', model: 'claude-sonnet-5' } });
  });

  it('[EF-IA-05] refuses to start without any AI key', () => {
    const env = BASE_ENV;

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow('ANTHROPIC_API_KEY or GEMINI_API_KEY');
  });

  it.each([
    ['ANTHROPIC_MODEL', { ...VALID_ENV, ANTHROPIC_MODEL: '' }],
    ['GEMINI_MODEL', { ...VALID_ENV, GEMINI_MODEL: undefined }],
  ])('[EF-IA-05] requires %s when its key is set (models are never hard-coded)', (variable, env) => {
    expect(() => loadConfig(env)).toThrow(variable);
  });

  it('[ENF-SEC-08] never echoes an AI key in the error message', () => {
    const env = { ...VALID_ENV, ANTHROPIC_MODEL: '', ANTHROPIC_API_KEY: 'sk-ant-secret-value' };

    expect(() => loadConfig(env)).not.toThrow(/sk-ant-secret-value/);
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

    const env = {
      ...VALID_ENV,
      FRONTEND_ORIGIN: secretLookingValue,
      DATABASE_URL_APP: 'postgresql://u:s3cret@neon.tech/d',
    };

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).not.toThrow(/s3cret/);
  });

  it('[ENF-SEC-15] refuses a remote database URL without sslmode=verify-full', () => {
    const insecure = NEON_URL.replace('verify-full', 'require');

    expect(() => loadConfig({ ...VALID_ENV, DATABASE_URL_APP: insecure })).toThrow(/verify-full/);
  });
});
