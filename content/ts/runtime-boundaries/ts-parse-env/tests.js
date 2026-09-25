const { parseEnv, EnvError } = solution;

const DB = 'postgres://app:secret@db.internal:5432/shop';

function errorsOf(env) {
  try {
    parseEnv(env);
  } catch (e) {
    return e;
  }
  throw new Error('expected parseEnv to throw');
}

describe('a valid environment', () => {
  it('applies every default', () => {
    expect(parseEnv({ DATABASE_URL: DB })).toStrictEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: DB,
      logLevel: 'info',
      requestTimeoutMs: 5000,
      enableMetrics: false,
      featureFlags: [],
    });
  });
  it('parses every variable when set', () => {
    const config = parseEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://db/shop',
      LOG_LEVEL: 'warn',
      REQUEST_TIMEOUT_MS: '250',
      ENABLE_METRICS: 'true',
      FEATURE_FLAGS: 'search,export',
      UNRELATED: 'ignored',
    });
    expect(config).toStrictEqual({
      nodeEnv: 'production',
      port: 8080,
      databaseUrl: 'postgresql://db/shop',
      logLevel: 'warn',
      requestTimeoutMs: 250,
      enableMetrics: true,
      featureFlags: ['search', 'export'],
    });
  });
  it('accepts 1 and 0 for booleans', () => {
    expect(parseEnv({ DATABASE_URL: DB, ENABLE_METRICS: '1' }).enableMetrics).toBe(true);
    expect(parseEnv({ DATABASE_URL: DB, ENABLE_METRICS: '0' }).enableMetrics).toBe(false);
    expect(parseEnv({ DATABASE_URL: DB, ENABLE_METRICS: 'false' }).enableMetrics).toBe(false);
  });
  it('trims feature flags and drops empty entries', () => {
    expect(parseEnv({ DATABASE_URL: DB, FEATURE_FLAGS: ' beta , new-checkout ,, ' }).featureFlags)
      .toEqual(['beta', 'new-checkout']);
  });
  it('treats an empty string as unset', () => {
    const config = parseEnv({ DATABASE_URL: DB, PORT: '', LOG_LEVEL: '', ENABLE_METRICS: '', FEATURE_FLAGS: '' });
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.enableMetrics).toBe(false);
    expect(config.featureFlags).toEqual([]);
  });
  it('returns a frozen object', () => {
    const config = parseEnv({ DATABASE_URL: DB });
    expect(Object.isFrozen(config)).toBe(true);
  });
  it('accepts the port bounds', () => {
    expect(parseEnv({ DATABASE_URL: DB, PORT: '1' }).port).toBe(1);
    expect(parseEnv({ DATABASE_URL: DB, PORT: '65535' }).port).toBe(65535);
  });
});

describe('coercion traps', () => {
  it('rejects "yes" for a boolean instead of calling it true', () => {
    const e = errorsOf({ DATABASE_URL: DB, ENABLE_METRICS: 'yes' });
    expect(e.errors).toEqual(['ENABLE_METRICS must be true, false, 1 or 0']);
  });
  it('rejects numbers with trailing junk, decimals, exponents and spaces', () => {
    for (const bad of ['80abc', '80.5', '1e3', ' 8080', '-1', '0x50']) {
      const e = errorsOf({ DATABASE_URL: DB, PORT: bad });
      expect(e.errors).toEqual(['PORT must be an integer between 1 and 65535']);
    }
  });
  it('rejects ports out of range', () => {
    expect(errorsOf({ DATABASE_URL: DB, PORT: '0' }).errors).toEqual(['PORT must be an integer between 1 and 65535']);
    expect(errorsOf({ DATABASE_URL: DB, PORT: '65536' }).errors).toEqual(['PORT must be an integer between 1 and 65535']);
  });
  it('rejects a zero timeout', () => {
    expect(errorsOf({ DATABASE_URL: DB, REQUEST_TIMEOUT_MS: '0' }).errors).toEqual(['REQUEST_TIMEOUT_MS must be a positive integer']);
  });
  it('is case-sensitive for enums', () => {
    expect(errorsOf({ DATABASE_URL: DB, LOG_LEVEL: 'INFO' }).errors).toEqual(['LOG_LEVEL must be one of debug, info, warn, error']);
    expect(errorsOf({ DATABASE_URL: DB, NODE_ENV: 'prod' }).errors).toEqual(['NODE_ENV must be one of development, test, production']);
  });
  it('does not accept inherited keys as enum values', () => {
    expect(errorsOf({ DATABASE_URL: DB, LOG_LEVEL: 'toString' }).errors).toEqual(['LOG_LEVEL must be one of debug, info, warn, error']);
  });
});

describe('DATABASE_URL', () => {
  it('is required', () => {
    expect(errorsOf({}).errors).toEqual(['DATABASE_URL is required']);
    expect(errorsOf({ DATABASE_URL: '' }).errors).toEqual(['DATABASE_URL is required']);
  });
  it('must be a postgres URL', () => {
    for (const bad of ['db.internal:5432', 'mysql://db/shop', 'not a url']) {
      expect(errorsOf({ DATABASE_URL: bad }).errors).toEqual(['DATABASE_URL must be a postgres:// URL']);
    }
  });
});

describe('reporting', () => {
  it('collects every error, in the documented order', () => {
    const e = errorsOf({
      FEATURE_FLAGS: 'x',
      ENABLE_METRICS: 'on',
      REQUEST_TIMEOUT_MS: 'soon',
      LOG_LEVEL: 'verbose',
      PORT: 'http',
      NODE_ENV: 'staging',
    });
    expect(e.errors).toEqual([
      'NODE_ENV must be one of development, test, production',
      'PORT must be an integer between 1 and 65535',
      'DATABASE_URL is required',
      'LOG_LEVEL must be one of debug, info, warn, error',
      'REQUEST_TIMEOUT_MS must be a positive integer',
      'ENABLE_METRICS must be true, false, 1 or 0',
    ]);
  });
  it('throws an EnvError whose message lists the problems', () => {
    const e = errorsOf({ PORT: 'x' });
    expect(e).toBeInstanceOf(EnvError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('EnvError');
    expect(e.message).toBe('Invalid environment:\n- PORT must be an integer between 1 and 65535\n- DATABASE_URL is required');
  });
  it('never puts a value in an error message (it may be a secret)', () => {
    const e = errorsOf({ DATABASE_URL: 'mysql://root:hunter2@db/shop' });
    expect(e.message.includes('hunter2')).toBe(false);
  });
});
