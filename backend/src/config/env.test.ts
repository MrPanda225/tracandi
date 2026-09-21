import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

describe('loadConfig', () => {
  it('[ENF-SEC-03] reads the configuration from the environment and applies defaults', () => {
    const config = loadConfig({ FRONTEND_ORIGIN: 'http://127.0.0.1:5173' });

    expect(config).toEqual({ host: '127.0.0.1', port: 4000, frontendOrigin: 'http://127.0.0.1:5173' });
  });

  it('[ENF-SEC-03] parses explicit host and port', () => {
    const config = loadConfig({ HOST: '0.0.0.0', PORT: '8080', FRONTEND_ORIGIN: 'http://localhost:5173' });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
  });

  it.each([
    [{}, 'FRONTEND_ORIGIN'],
    [{ FRONTEND_ORIGIN: 'not a url' }, 'FRONTEND_ORIGIN'],
    [{ FRONTEND_ORIGIN: 'http://127.0.0.1:5173/app' }, 'FRONTEND_ORIGIN'],
    [{ FRONTEND_ORIGIN: 'http://127.0.0.1:5173', PORT: '70000' }, 'PORT'],
    [{ FRONTEND_ORIGIN: 'http://127.0.0.1:5173', HOST: 'my host' }, 'HOST'],
  ])('[ENF-SEC-03] rejects an invalid environment (%j) naming %s', (env, variable) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(variable);
  });

  it('[ENF-SEC-08] never echoes the rejected value in the error message', () => {
    const secretLookingValue = 'postgresql://u:s3cret@h/d';

    expect(() => loadConfig({ FRONTEND_ORIGIN: secretLookingValue })).toThrow(ConfigError);
    expect(() => loadConfig({ FRONTEND_ORIGIN: secretLookingValue })).not.toThrow(/s3cret/);
  });
});
