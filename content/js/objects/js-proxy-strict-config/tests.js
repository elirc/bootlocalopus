const { strictConfig, UnknownKeyError } = solution;

const make = () => {
  const values = {
    DATABASE_URL: 'postgres://db.internal/app',
    PORT: 8080,
    SENTRY_DSN: undefined,
    features: ['search'],
    db: { host: 'db.internal', pool: { max: 10 } },
  };
  return { values, config: strictConfig(values) };
};

function thrown(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected the read to throw, but it did not');
}

describe('reads', () => {
  it('returns existing values', () => {
    const { config } = make();
    expect(config.DATABASE_URL).toBe('postgres://db.internal/app');
    expect(config.PORT).toBe(8080);
    expect(config.features).toEqual(['search']);
  });

  it('an explicitly undefined key is not an unknown key', () => {
    const { config } = make();
    expect(config.SENTRY_DSN).toBeUndefined();
  });

  it('throws UnknownKeyError for a typo', () => {
    const { config } = make();
    const e = thrown(() => config.DATABSE_URL);
    expect(e).toBeInstanceOf(UnknownKeyError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('UnknownKeyError');
    expect(e.key).toBe('DATABSE_URL');
    expect(e.message).toBe('config: unknown key "DATABSE_URL"');
  });

  it('uses the given name', () => {
    const e = thrown(() => strictConfig({ a: 1 }, { name: 'env' }).b);
    expect(e.message).toBe('env: unknown key "b"');
  });

  it('nested plain objects are strict too, with a dotted name', () => {
    const { config } = make();
    expect(config.db.host).toBe('db.internal');
    expect(config.db.pool.max).toBe(10);
    expect(thrown(() => config.db.hots).message).toBe('config.db: unknown key "hots"');
    expect(thrown(() => config.db.pool.mx).message).toBe('config.db.pool: unknown key "mx"');
  });
});

describe('the probes that must not throw', () => {
  it('can be awaited and returned from an async function', async () => {
    const { config } = make();
    const got = await (async () => config)();
    expect(got).toBe(config);
    expect(await Promise.resolve(config)).toBe(config);
  });

  it('can be serialised with JSON.stringify', () => {
    const { config, values } = make();
    expect(JSON.stringify(config)).toBe(JSON.stringify(values));
  });

  it('survives String(), template literals and symbol reads', () => {
    const { config } = make();
    expect(String(config)).toBe('[object Object]');
    expect(`${config}`).toBe('[object Object]');
    expect(config[Symbol.iterator]).toBeUndefined();
    expect(config[Symbol.for('anything')]).toBeUndefined();
  });

  it('supports in, Object.keys and spread', () => {
    const { config, values } = make();
    expect('PORT' in config).toBe(true);
    expect('NOPE' in config).toBe(false);
    expect(Object.keys(config)).toEqual(Object.keys(values));
    expect({ ...config }.PORT).toBe(8080);
  });
});

describe('read-only', () => {
  it('assignment throws a TypeError and leaves the values alone', () => {
    const { config, values } = make();
    expect(() => { config.PORT = 1; }).toThrow(TypeError);
    expect(() => { config.NEW_KEY = 1; }).toThrow(TypeError);
    expect(values.PORT).toBe(8080);
    expect('NEW_KEY' in values).toBe(false);
  });

  it('delete and defineProperty throw a TypeError', () => {
    const { config, values } = make();
    expect(() => { delete config.PORT; }).toThrow(TypeError);
    expect(() => Object.defineProperty(config, 'PORT', { value: 1 })).toThrow(TypeError);
    expect(values.PORT).toBe(8080);
  });

  it('nested objects are read-only too', () => {
    const { config, values } = make();
    expect(() => { config.db.host = 'evil'; }).toThrow(TypeError);
    expect(() => { config.db.pool.max = 1000; }).toThrow(TypeError);
    expect(values.db.host).toBe('db.internal');
    expect(values.db.pool.max).toBe(10);
  });
});
