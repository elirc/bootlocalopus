import { inspect } from 'node:util';

const DB = 'postgres://app:hunter2-db-pass@db.internal:5432/app';
const SESSION = 'session-secret-0123456789abcdef-XYZ';
const base = { DATABASE_URL: DB, SESSION_SECRET: SESSION };

const configError = (env) => {
  try {
    solution.loadConfig(env);
  } catch (e) {
    return e;
  }
  return null;
};

/** The variable each problem names: the text before the first space. */
const named = (e) => e.problems.map((p) => String(p).split(' ')[0]).sort();

describe('valid config', () => {
  it('applies every default', () => {
    const config = solution.loadConfig(base);
    expect(config.port).toBe(3000);
    expect(config.env).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.enableSignups).toBe(false);
    expect(config.databaseUrl).toBeInstanceOf(solution.Secret);
    expect(config.sessionSecret).toBeInstanceOf(solution.Secret);
  });

  it('parses every variable', () => {
    const config = solution.loadConfig({
      ...base, PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'warn', ENABLE_SIGNUPS: 'true',
    });
    expect(config.port).toBe(8080);
    expect(config.env).toBe('production');
    expect(config.logLevel).toBe('warn');
    expect(config.enableSignups).toBe(true);
    expect(solution.loadConfig({ ...base, ENABLE_SIGNUPS: 'false' }).enableSignups).toBe(false);
  });

  it('accepts the edges of the port range and postgresql://', () => {
    expect(solution.loadConfig({ ...base, PORT: '1' }).port).toBe(1);
    expect(solution.loadConfig({ ...base, PORT: '65535' }).port).toBe(65535);
    expect(solution.loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@h/db' }).databaseUrl.reveal()).toBe('postgresql://u:p@h/db');
  });

  it('treats an empty string as missing', () => {
    const config = solution.loadConfig({ ...base, PORT: '', LOG_LEVEL: '', NODE_ENV: '', ENABLE_SIGNUPS: '' });
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.env).toBe('development');
    expect(config.enableSignups).toBe(false);
  });

  it('ignores unknown keys and does not read process.env', () => {
    const saved = process.env.PORT;
    process.env.PORT = 'not-a-port';
    try {
      const config = solution.loadConfig({ ...base, HOME: '/root', PATH: '/bin', UNRELATED: 'x' });
      expect(config.port).toBe(3000);
    } finally {
      if (saved === undefined) delete process.env.PORT; else process.env.PORT = saved;
    }
  });

  it('is frozen', () => {
    const config = solution.loadConfig(base);
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => { config.port = 1; }).toThrow(TypeError);
  });

  it('serialises to exactly the documented shape, secrets redacted', () => {
    const config = solution.loadConfig(base);
    expect(JSON.parse(JSON.stringify(config))).toStrictEqual({
      port: 3000, env: 'development', logLevel: 'info', enableSignups: false,
      databaseUrl: '[REDACTED]', sessionSecret: '[REDACTED]',
    });
  });
});

describe('secrets', () => {
  it('reveal() returns the real value', () => {
    const config = solution.loadConfig(base);
    expect(config.databaseUrl.reveal()).toBe(DB);
    expect(config.sessionSecret.reveal()).toBe(SESSION);
    expect(new solution.Secret('abc').reveal()).toBe('abc');
  });

  it('never appear in JSON, even after spreading the config', () => {
    const config = solution.loadConfig(base);
    for (const text of [JSON.stringify(config), JSON.stringify({ ...config }), JSON.stringify({ nested: { config } })]) {
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain(SESSION);
    }
  });

  it('never appear in util.inspect / console.log output', () => {
    const config = solution.loadConfig(base);
    const texts = [
      inspect(config), inspect(config, { depth: Infinity, showHidden: true }),
      inspect(config.sessionSecret), inspect({ wrapped: [config] }, { depth: Infinity }),
    ];
    for (const text of texts) {
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain(SESSION);
    }
    expect(inspect(config.sessionSecret)).toContain('[REDACTED]');
  });

  it('show [REDACTED] when turned into a string', () => {
    const { sessionSecret } = solution.loadConfig(base);
    expect(String(sessionSecret)).toBe('[REDACTED]');
    expect(`${sessionSecret}`).toBe('[REDACTED]');
    expect(JSON.stringify(sessionSecret)).toBe('"[REDACTED]"');
  });

  it('keep the value off every ordinary property', () => {
    const secret = new solution.Secret('super-private-value');
    expect(inspect(secret, { customInspect: false, showHidden: true })).not.toContain('super-private-value');
    expect(JSON.stringify(Object.values(secret))).not.toContain('super-private-value');
    expect(JSON.stringify(Object.entries(Object.getOwnPropertyDescriptors(secret)).map(([k, d]) => [k, String(d.value)])))
      .not.toContain('super-private-value');
  });
});

describe('invalid config', () => {
  it('throws a ConfigError', () => {
    const e = configError({});
    expect(e).toBeInstanceOf(solution.ConfigError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ConfigError');
    expect(Array.isArray(e.problems)).toBe(true);
  });

  it('requires DATABASE_URL and SESSION_SECRET', () => {
    expect(named(configError({}))).toEqual(['DATABASE_URL', 'SESSION_SECRET']);
    expect(named(configError({ DATABASE_URL: '', SESSION_SECRET: '' }))).toEqual(['DATABASE_URL', 'SESSION_SECRET']);
  });

  it('reports every bad variable at once, one problem each', () => {
    const e = configError({
      PORT: 'abc', NODE_ENV: 'prod', LOG_LEVEL: 'verbose', ENABLE_SIGNUPS: 'yes', SESSION_SECRET: 'too-short',
    });
    expect(named(e)).toEqual(['DATABASE_URL', 'ENABLE_SIGNUPS', 'LOG_LEVEL', 'NODE_ENV', 'PORT', 'SESSION_SECRET']);
    for (const problem of e.problems) expect(e.message).toContain(problem);
  });

  it('rejects every malformed PORT', () => {
    for (const PORT of ['abc', '3000abc', '0', '65536', '80.5', '-1', ' 80', '1e3', '0x50']) {
      const e = configError({ ...base, PORT });
      expect({ PORT, problems: e && named(e) }).toEqual({ PORT, problems: ['PORT'] });
    }
  });

  it('is exact about enums and booleans', () => {
    expect(named(configError({ ...base, NODE_ENV: 'Production' }))).toEqual(['NODE_ENV']);
    expect(named(configError({ ...base, LOG_LEVEL: 'INFO' }))).toEqual(['LOG_LEVEL']);
    for (const ENABLE_SIGNUPS of ['TRUE', '1', 'yes', 'false ']) {
      expect(named(configError({ ...base, ENABLE_SIGNUPS }))).toEqual(['ENABLE_SIGNUPS']);
    }
  });

  it('rejects a DATABASE_URL that is not a postgres URL, without echoing it', () => {
    for (const DATABASE_URL of ['mysql://root:hunter2@db/app', 'hunter2 is not a url', 'https://u:hunter2@db/app']) {
      const e = configError({ ...base, DATABASE_URL });
      expect(named(e)).toEqual(['DATABASE_URL']);
      expect(e.message).not.toContain('hunter2');
      expect(JSON.stringify(e.problems)).not.toContain('hunter2');
    }
  });

  it('rejects a short SESSION_SECRET, without echoing it', () => {
    const short = 'x'.repeat(20) + 'LEAKED1';
    const e = configError({ ...base, SESSION_SECRET: short });
    expect(named(e)).toEqual(['SESSION_SECRET']);
    expect(e.message).not.toContain('LEAKED1');
    expect(JSON.stringify(e.problems)).not.toContain('LEAKED1');
    expect(solution.loadConfig({ ...base, SESSION_SECRET: 'y'.repeat(32) }).sessionSecret.reveal()).toBe('y'.repeat(32));
    expect(named(configError({ ...base, SESSION_SECRET: 'y'.repeat(31) }))).toEqual(['SESSION_SECRET']);
  });
});
