const { resolveOptions, DEFAULTS } = solution;
const base = { baseUrl: 'https://api.example.com' };
const errorOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('defaults', () => {
  it('fills in every default', () => {
    expect(resolveOptions(base)).toEqual({
      baseUrl: 'https://api.example.com',
      timeoutMs: 10000,
      retries: 2,
      retryOn: [502, 503, 504],
      headers: { accept: 'application/json' },
      keepAlive: true,
    });
  });

  it('keeps falsy values the caller chose: 0 and false are not "missing"', () => {
    const o = resolveOptions({ ...base, timeoutMs: 0, retries: 0, keepAlive: false, retryOn: [] });
    expect(o.timeoutMs).toBe(0);
    expect(o.retries).toBe(0);
    expect(o.keepAlive).toBe(false);
    expect(o.retryOn).toEqual([]);
  });

  it('treats an explicit undefined as "not given"', () => {
    const o = resolveOptions({ ...base, timeoutMs: undefined, retries: undefined });
    expect(o.timeoutMs).toBe(10000);
    expect(o.retries).toBe(2);
  });

  it('strips trailing slashes from baseUrl', () => {
    expect(resolveOptions({ baseUrl: 'https://api.example.com/v1//' }).baseUrl).toBe('https://api.example.com/v1');
  });
});

describe('nested defaults', () => {
  it('merges headers over the default headers instead of replacing them', () => {
    const o = resolveOptions({ ...base, headers: { authorization: 'Bearer x' } });
    expect(o.headers).toEqual({ accept: 'application/json', authorization: 'Bearer x' });
  });

  it('lets the caller override a default header, whatever its case', () => {
    const o = resolveOptions({ ...base, headers: { Accept: 'text/csv', 'X-Trace': '1' } });
    expect(o.headers).toEqual({ accept: 'text/csv', 'x-trace': '1' });
  });

  it('never mutates the caller\'s options or the shared defaults', () => {
    const input = { ...base, headers: { authorization: 'Bearer x' }, retryOn: [500] };
    const snapshot = JSON.stringify(input);
    resolveOptions(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(DEFAULTS.headers).toEqual({ accept: 'application/json' });
    expect(resolveOptions(base).headers).toEqual({ accept: 'application/json' });
  });

  it('does not keep a reference to the caller\'s arrays and objects', () => {
    const headers = { authorization: 'Bearer x' };
    const retryOn = [500];
    const o = resolveOptions({ ...base, headers, retryOn });
    headers.authorization = 'changed later';
    retryOn.push(429);
    expect(o.headers.authorization).toBe('Bearer x');
    expect(o.retryOn).toEqual([500]);
  });

  it('returns a frozen result, nested values included', () => {
    const o = resolveOptions({ ...base, headers: { a: '1' } });
    expect(Object.isFrozen(o)).toBe(true);
    expect(Object.isFrozen(o.headers)).toBe(true);
    expect(Object.isFrozen(o.retryOn)).toBe(true);
  });

  it('gives every call its own objects', () => {
    const a = resolveOptions(base);
    const b = resolveOptions(base);
    expect(a.headers).not.toBe(b.headers);
  });
});

describe('unknown options fail loudly', () => {
  it('throws a TypeError naming the key and suggesting the closest one', () => {
    const e = errorOf(() => resolveOptions({ ...base, retires: 5 }));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toBe('Unknown option "retires". Did you mean "retries"?');
  });

  it('suggests despite case differences', () => {
    expect(errorOf(() => resolveOptions({ ...base, timeoutms: 5 })).message)
      .toBe('Unknown option "timeoutms". Did you mean "timeoutMs"?');
  });

  it('omits the suggestion when nothing is close', () => {
    expect(errorOf(() => resolveOptions({ ...base, verbose: true })).message).toBe('Unknown option "verbose".');
  });
});

describe('validation', () => {
  it('requires an http(s) baseUrl', () => {
    expect(() => resolveOptions({})).toThrow(TypeError);
    expect(() => resolveOptions()).toThrow(TypeError);
    expect(() => resolveOptions({ baseUrl: 'api.example.com' })).toThrow(TypeError);
    expect(() => resolveOptions({ baseUrl: 'http://localhost:3000' })).not.toThrow();
  });

  it('rejects wrongly typed values instead of coercing them', () => {
    expect(() => resolveOptions({ ...base, timeoutMs: '5000' })).toThrow(TypeError);
    expect(() => resolveOptions({ ...base, timeoutMs: -1 })).toThrow(TypeError);
    expect(() => resolveOptions({ ...base, retries: 1.5 })).toThrow(TypeError);
    expect(() => resolveOptions({ ...base, retries: null })).toThrow(TypeError);
    expect(() => resolveOptions({ ...base, keepAlive: 'false' })).toThrow(TypeError);
    expect(() => resolveOptions({ ...base, retryOn: 503 })).toThrow(TypeError);
  });
});
