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
const GROQ = {
  GROQ_API_KEY: 'gsk-test-key',
  GROQ_MODEL_1: 'openai/gpt-oss-120b',
  GROQ_MODEL_2: 'qwen/qwen3.8-27b',
  GROQ_MODEL_3: 'openai/gpt-oss-20b',
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
      scheduler: { timezone: 'Europe/Paris', gmailCron: '*/30 * * * *', watchCron: '0 7,13,19 * * *' },
      // ENF-COL-03: no contact address by default, so nothing is collected until one is given.
      scraper: { contact: null },
      // EF-VEI-37: no official source is configured unless its credentials are given.
      officialSources: { franceTravail: null, laBonneAlternance: null },
      // ENF-MAI-07: an optional feature is off until the configuration names it.
      features: new Set(),
      // BES-39: no proxy in front of the API unless the deployment says so.
      trustProxyHops: 0,
      // EF-EXE-06: one long treatment at a time on the whole server, unless the deployment allows more.
      maxConcurrentJobs: 1,
      // EF-CVX-33: five analyses of the CV workshop a day, unless the deployment says otherwise.
      cvAnalysesPerDay: 5,
      watch: { maxScoredOffersPerPass: 20, profileDeductionsPerDay: 5, chosenOfferExtractionsPerDay: 20 },
    });
  });

  it('[ENF-SEC-19] [BES-39] reads how many proxies stand in front of the API, and refuses anything else', () => {
    expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: '2' }).trustProxyHops).toBe(2);
    expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: 'oui' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: '9' })).toThrow(/TRUST_PROXY/);
  });

  it('[EF-CVX-33] reads the daily allowance of CV analyses, 0 lifting it, and refuses anything else', () => {
    expect(loadConfig({ ...VALID_ENV, CV_ANALYSES_PER_DAY: '50' }).cvAnalysesPerDay).toBe(50);
    expect(loadConfig({ ...VALID_ENV, CV_ANALYSES_PER_DAY: '0' }).cvAnalysesPerDay).toBe(0);
    expect(() => loadConfig({ ...VALID_ENV, CV_ANALYSES_PER_DAY: '-1' })).toThrow(/CV_ANALYSES_PER_DAY/);
    expect(() => loadConfig({ ...VALID_ENV, CV_ANALYSES_PER_DAY: 'illimité' })).toThrow(
      /CV_ANALYSES_PER_DAY/,
    );
  });

  it('[EF-VEI-37] [ENF-SEC-23] reads the France Travail credentials as a pair, or none', () => {
    expect(loadConfig(VALID_ENV).officialSources.franceTravail).toBeNull();
    expect(
      loadConfig({ ...VALID_ENV, FRANCE_TRAVAIL_CLIENT_ID: 'client', FRANCE_TRAVAIL_CLIENT_SECRET: 'secret' })
        .officialSources.franceTravail,
    ).toEqual({ clientId: 'client', clientSecret: 'secret' });
    expect(() => loadConfig({ ...VALID_ENV, FRANCE_TRAVAIL_CLIENT_ID: 'client' })).toThrow(/FRANCE_TRAVAIL/);
  });

  it('[EF-VEI-37] [ENF-SEC-23] reads the key of La bonne alternance when it is given', () => {
    expect(loadConfig({ ...VALID_ENV, LBA_API_KEY: 'cle' }).officialSources.laBonneAlternance).toEqual({
      apiKey: 'cle',
    });
  });

  it('[EF-EXE-06] reads how many long treatments may run at once, and refuses anything else', () => {
    expect(loadConfig({ ...VALID_ENV, MAX_CONCURRENT_JOBS: '3' }).maxConcurrentJobs).toBe(3);
    expect(() => loadConfig({ ...VALID_ENV, MAX_CONCURRENT_JOBS: '0' })).toThrow(/MAX_CONCURRENT_JOBS/);
    expect(() => loadConfig({ ...VALID_ENV, MAX_CONCURRENT_JOBS: 'beaucoup' })).toThrow(
      /MAX_CONCURRENT_JOBS/,
    );
  });

  it('[ENF-MAI-07] enables the optional features the configuration names, and only those', () => {
    expect(loadConfig({ ...VALID_ENV, ENABLED_FEATURES: 'watch, cv' }).features).toEqual(
      new Set(['watch', 'cv']),
    );
    expect(loadConfig({ ...VALID_ENV, ENABLED_FEATURES: 'cv' }).features).toEqual(new Set(['cv']));
    expect(loadConfig({ ...VALID_ENV, ENABLED_FEATURES: '' }).features).toEqual(new Set());
  });

  it('[ENF-MAI-07] refuses to start with a feature it does not know, rather than ignoring a typo', () => {
    expect(() => loadConfig({ ...VALID_ENV, ENABLED_FEATURES: 'watch,cvs' })).toThrow(/ENABLED_FEATURES/);
  });

  it('[EF-GML-03] reads the time zone and the cron expression of the Gmail synchronisation', () => {
    const config = loadConfig({
      ...VALID_ENV,
      SCHEDULER_TIMEZONE: 'America/Montreal',
      CRON_GMAIL: '*/15 8-20 * * *',
    });

    expect(config.scheduler).toEqual({
      timezone: 'America/Montreal',
      gmailCron: '*/15 8-20 * * *',
      watchCron: '0 7,13,19 * * *',
    });
  });

  it('[EF-VEI-06] reads the schedule of the watch, 7, 13 and 19 o’clock by default', () => {
    expect(loadConfig(VALID_ENV).scheduler.watchCron).toBe('0 7,13,19 * * *');
    expect(loadConfig({ ...VALID_ENV, CRON_SCRAPER: '0 9 * * 1-5' }).scheduler.watchCron).toBe('0 9 * * 1-5');
    expect(() => loadConfig({ ...VALID_ENV, CRON_SCRAPER: 'tous les matins' })).toThrow();
  });

  it('[ENF-COL-03] reads the contact address the collector identifies itself with', () => {
    expect(loadConfig({ ...VALID_ENV, SCRAPER_CONTACT_EMAIL: 'alex@example.com' }).scraper.contact).toBe(
      'alex@example.com',
    );
    // Left empty, nothing is collected rather than being collected anonymously.
    expect(loadConfig({ ...VALID_ENV, SCRAPER_CONTACT_EMAIL: '' }).scraper.contact).toBeNull();
    expect(() => loadConfig({ ...VALID_ENV, SCRAPER_CONTACT_EMAIL: 'pas-une-adresse' })).toThrow();
  });

  it.each([
    ['SCHEDULER_TIMEZONE', { ...VALID_ENV, SCHEDULER_TIMEZONE: 'Europe/Atlantis' }],
    ['CRON_GMAIL', { ...VALID_ENV, CRON_GMAIL: 'every 30 minutes' }],
    ['CRON_GMAIL', { ...VALID_ENV, CRON_GMAIL: '*/30 * * *' }],
  ])('[EF-GML-03] refuses to start with an invalid %s', (variable, env) => {
    expect(() => loadConfig(env)).toThrow(new RegExp(variable));
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

  it('[RG-13] [EF-IA-05] starts with the Groq key alone, one route entry per configured model', () => {
    const config = loadConfig({ ...BASE_ENV, ...GROQ });

    expect(config.llm).toEqual({
      groq_1: { apiKey: 'gsk-test-key', model: 'openai/gpt-oss-120b' },
      groq_2: { apiKey: 'gsk-test-key', model: 'qwen/qwen3.8-27b' },
      groq_3: { apiKey: 'gsk-test-key', model: 'openai/gpt-oss-20b' },
    });
  });

  it('[EF-IA-05] leaves out a Groq slot that is not configured', () => {
    const config = loadConfig({ ...BASE_ENV, ...GROQ, GROQ_MODEL_2: '' });

    expect(Object.keys(config.llm)).toEqual(['groq_1', 'groq_3']);
  });

  it('[EF-IA-05] refuses a Groq key without a single model', () => {
    const env = { ...BASE_ENV, GROQ_API_KEY: 'gsk-test-key' };

    expect(() => loadConfig(env)).toThrow('GROQ_MODEL_1, GROQ_MODEL_2 or GROQ_MODEL_3');
  });

  it('[EF-IA-05] refuses to start without any AI key', () => {
    const env = BASE_ENV;

    expect(() => loadConfig(env)).toThrow(ConfigError);
    // EF-IA-05 (v1.35): the local model counts as a provider.
    expect(() => loadConfig(env)).toThrow(
      'ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY or LOCAL_LLM_BASE_URL',
    );
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

// T-1001 (v1.35, BES-48): the local model of the operator, an OpenAI-compatible service such as Ollama.
const LOCAL = { LOCAL_LLM_BASE_URL: 'http://192.168.1.54:11434/v1', LOCAL_LLM_MODEL: 'qwen3.5:4b' };
const errorOf = (env: Record<string, string | undefined>): string => {
  try {
    loadConfig(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('the configuration was accepted');
};

describe('loadConfig, local model', () => {
  it('[EF-IA-05] [EF-IA-07] starts with the local model alone, a private address needing no token', () => {
    const config = loadConfig({ ...BASE_ENV, ...LOCAL });

    expect(config.llm).toEqual({
      local: {
        apiKey: 'ollama',
        model: 'qwen3.5:4b',
        baseUrl: 'http://192.168.1.54:11434/v1',
        timeoutMs: 600_000,
        maxOutputTokens: 2_000,
        batchSize: 5,
        descriptionChars: 800,
      },
    });
  });

  it('[ENF-MAI-09] reads the delay, the output ceiling and the token from the configuration', () => {
    const config = loadConfig({
      ...BASE_ENV,
      ...LOCAL,
      LOCAL_LLM_API_KEY: 'local-test-token',
      LOCAL_LLM_TIMEOUT_MS: '300000',
      LOCAL_LLM_MAX_OUTPUT_TOKENS: '1500',
    });

    expect(config.llm.local).toMatchObject({
      apiKey: 'local-test-token',
      timeoutMs: 300_000,
      maxOutputTokens: 1_500,
    });
  });

  it('[EF-IA-07] keeps the other providers beside the local one, and drops a trailing slash of the address', () => {
    const config = loadConfig({
      ...VALID_ENV,
      ...LOCAL,
      LOCAL_LLM_BASE_URL: 'http://192.168.1.54:11434/v1/',
    });

    expect(Object.keys(config.llm).sort()).toEqual(['claude', 'gemini', 'local']);
    expect(config.llm.local?.baseUrl).toBe('http://192.168.1.54:11434/v1');
  });

  it.each([
    'http://localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://10.0.0.5:11434/v1',
    'http://172.20.1.9:11434/v1',
    'http://192.168.1.54:11434/v1',
    'http://100.88.1.2:11434/v1',
    'http://ollama.homelab.lan:11434/v1',
    'http://[::1]:11434/v1',
  ])('[ENF-SEC-24] accepts %s over http: the address is on a private network', (address) => {
    expect(loadConfig({ ...BASE_ENV, ...LOCAL, LOCAL_LLM_BASE_URL: address }).llm.local?.baseUrl).toBe(
      address,
    );
  });

  it.each(['http://llm.example.com/v1', 'http://8.8.8.8:11434/v1', 'http://172.32.0.1:11434/v1'])(
    '[ENF-SEC-24] refuses %s over http: a public address needs https',
    (address) => {
      const message = errorOf({
        ...BASE_ENV,
        ...LOCAL,
        LOCAL_LLM_BASE_URL: address,
        LOCAL_LLM_API_KEY: 'tok',
      });

      expect(message).toContain('LOCAL_LLM_BASE_URL');
      expect(message).toContain('https');
      expect(message).not.toContain(address);
    },
  );

  it('[ENF-SEC-24] accepts a public https address when a token is configured, and refuses it without one', () => {
    const env = { ...BASE_ENV, ...LOCAL, LOCAL_LLM_BASE_URL: 'https://ia.example.com/v1' };

    expect(loadConfig({ ...env, LOCAL_LLM_API_KEY: 'local-test-token' }).llm.local?.apiKey).toBe(
      'local-test-token',
    );
    expect(errorOf(env)).toContain('LOCAL_LLM_API_KEY');
  });

  it.each([
    ['text that is not an address', 'not an address'],
    ['a scheme other than http(s)', 'ftp://192.168.1.54/v1'],
    ['credentials in the address', 'http://user:pw@192.168.1.54:11434/v1'],
    ['a query string', 'http://192.168.1.54:11434/v1?key=1'],
    ['a fragment', 'http://192.168.1.54:11434/v1#x'],
  ])('[ENF-MAI-09] refuses an address with %s, naming the variable', (_reason, address) => {
    expect(errorOf({ ...BASE_ENV, ...LOCAL, LOCAL_LLM_BASE_URL: address })).toContain('LOCAL_LLM_BASE_URL');
  });

  it.each([['-1'], ['0'], ['abc'], ['3600001']])(
    '[ENF-MAI-09] refuses the delay %s, naming the variable',
    (delay) => {
      expect(errorOf({ ...BASE_ENV, ...LOCAL, LOCAL_LLM_TIMEOUT_MS: delay })).toContain(
        'LOCAL_LLM_TIMEOUT_MS',
      );
    },
  );

  it.each([['0'], ['-5'], ['100000']])(
    '[ENF-MAI-09] refuses the output ceiling %s, naming the variable',
    (ceiling) => {
      expect(errorOf({ ...BASE_ENV, ...LOCAL, LOCAL_LLM_MAX_OUTPUT_TOKENS: ceiling })).toContain(
        'LOCAL_LLM_MAX_OUTPUT_TOKENS',
      );
    },
  );

  it.each([
    ['LOCAL_LLM_BATCH_SIZE', '0'],
    ['LOCAL_LLM_BATCH_SIZE', '51'],
    ['LOCAL_LLM_BATCH_SIZE', 'x'],
    ['LOCAL_LLM_DESCRIPTION_CHARS', '199'],
    ['LOCAL_LLM_DESCRIPTION_CHARS', '5001'],
  ])('[ENF-MAI-09] [EF-IA-12] refuses %s = %s, naming the variable', (variable, value) => {
    expect(errorOf({ ...BASE_ENV, ...LOCAL, [variable]: value })).toContain(variable);
  });

  it('[ENF-MAI-09] refuses an address without a model, and a model or a token without an address', () => {
    expect(errorOf({ ...BASE_ENV, LOCAL_LLM_BASE_URL: LOCAL.LOCAL_LLM_BASE_URL })).toContain(
      'LOCAL_LLM_MODEL',
    );
    expect(errorOf({ ...VALID_ENV, LOCAL_LLM_MODEL: 'qwen3.5:4b' })).toContain('LOCAL_LLM_BASE_URL');
    expect(errorOf({ ...VALID_ENV, LOCAL_LLM_API_KEY: 'local-test-token' })).toContain('LOCAL_LLM_BASE_URL');
  });

  it('[ENF-SEC-25] never echoes the token nor the address of the local model in an error message', () => {
    const message = errorOf({
      ...BASE_ENV,
      ...LOCAL,
      LOCAL_LLM_API_KEY: 'local-secret-token',
      LOCAL_LLM_TIMEOUT_MS: '-1',
      LOCAL_LLM_BASE_URL: 'http://user:pw@llm.example.com/v1',
    });

    expect(message).not.toMatch(/local-secret-token|llm\.example\.com|user:pw/);
  });

  it('[EF-IA-05] leaves the local model out when its address is empty, as for the other optional variables', () => {
    const config = loadConfig({ ...VALID_ENV, LOCAL_LLM_BASE_URL: '', LOCAL_LLM_MODEL: '' });

    expect(Object.keys(config.llm)).toEqual(['claude', 'gemini']);
  });
});

describe('loadConfig, scored offers per pass', () => {
  it('[EF-EXE-07] scores 20 offers per pass by default, and reads the ceiling from the configuration', () => {
    expect(loadConfig(VALID_ENV).watch).toEqual({
      maxScoredOffersPerPass: 20,
      profileDeductionsPerDay: 5,
      chosenOfferExtractionsPerDay: 20,
    });
    expect(loadConfig({ ...VALID_ENV, MAX_SCORED_OFFERS_PER_PASS: '35' }).watch.maxScoredOffersPerPass).toBe(
      35,
    );
  });

  it('[EF-EXE-07] lifts the ceiling with 0, and counts an empty line as absent', () => {
    expect(loadConfig({ ...VALID_ENV, MAX_SCORED_OFFERS_PER_PASS: '0' }).watch.maxScoredOffersPerPass).toBe(
      0,
    );
    expect(loadConfig({ ...VALID_ENV, MAX_SCORED_OFFERS_PER_PASS: '' }).watch.maxScoredOffersPerPass).toBe(
      20,
    );
  });

  it.each([['-1'], ['abc'], ['1001']])('[EF-EXE-07] refuses the ceiling %s, naming the variable', (value) => {
    expect(errorOf({ ...VALID_ENV, MAX_SCORED_OFFERS_PER_PASS: value })).toContain(
      'MAX_SCORED_OFFERS_PER_PASS',
    );
  });
});

describe('loadConfig, deductions of a profile per day', () => {
  it('[EF-CVX-44] allows 5 a day by default, reads the allowance from the configuration, and lifts it with 0', () => {
    expect(loadConfig(VALID_ENV).watch.profileDeductionsPerDay).toBe(5);
    expect(loadConfig({ ...VALID_ENV, PROFILE_DEDUCTIONS_PER_DAY: '12' }).watch.profileDeductionsPerDay).toBe(
      12,
    );
    expect(loadConfig({ ...VALID_ENV, PROFILE_DEDUCTIONS_PER_DAY: '0' }).watch.profileDeductionsPerDay).toBe(
      0,
    );
    expect(loadConfig({ ...VALID_ENV, PROFILE_DEDUCTIONS_PER_DAY: '' }).watch.profileDeductionsPerDay).toBe(
      5,
    );
  });

  it.each([['-1'], ['abc'], ['1001']])(
    '[EF-CVX-44] refuses the allowance %s, naming the variable',
    (value) => {
      expect(errorOf({ ...VALID_ENV, PROFILE_DEDUCTIONS_PER_DAY: value })).toContain(
        'PROFILE_DEDUCTIONS_PER_DAY',
      );
    },
  );
});

describe('loadConfig, extractions of a chosen offer per day', () => {
  it('[ENF-COU-01] allows 20 a day by default, reads the allowance from the configuration, and lifts it with 0', () => {
    expect(loadConfig(VALID_ENV).watch.chosenOfferExtractionsPerDay).toBe(20);
    expect(
      loadConfig({ ...VALID_ENV, CHOSEN_OFFER_EXTRACTIONS_PER_DAY: '40' }).watch.chosenOfferExtractionsPerDay,
    ).toBe(40);
    expect(
      loadConfig({ ...VALID_ENV, CHOSEN_OFFER_EXTRACTIONS_PER_DAY: '0' }).watch.chosenOfferExtractionsPerDay,
    ).toBe(0);
    expect(
      loadConfig({ ...VALID_ENV, CHOSEN_OFFER_EXTRACTIONS_PER_DAY: '' }).watch.chosenOfferExtractionsPerDay,
    ).toBe(20);
  });

  it.each([['-1'], ['abc'], ['1001']])(
    '[ENF-COU-01] refuses the allowance %s, naming the variable',
    (value) => {
      expect(errorOf({ ...VALID_ENV, CHOSEN_OFFER_EXTRACTIONS_PER_DAY: value })).toContain(
        'CHOSEN_OFFER_EXTRACTIONS_PER_DAY',
      );
    },
  );
});
