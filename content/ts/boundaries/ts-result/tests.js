const { ok, err, attempt, attemptAsync, map, mapError, unwrapOr, unwrap, all } = solution;

describe('constructors', () => {
  it('builds ok and err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
});

describe('attempt', () => {
  it('captures a return value', () => {
    expect(attempt(() => 6 * 7)).toEqual({ ok: true, value: 42 });
  });
  it('captures a throw instead of propagating it', () => {
    const r = attempt(() => { throw new TypeError('nope'); });
    expect(r.ok).toBe(false);
    expect(r.error).toBeInstanceOf(TypeError);
    expect(r.error.message).toBe('nope');
  });
  it('handles JSON.parse, the classic case', () => {
    expect(attempt(() => JSON.parse('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
    expect(attempt(() => JSON.parse('not json')).ok).toBe(false);
  });
});

describe('attemptAsync', () => {
  it('captures a resolved value', async () => {
    expect(await attemptAsync(async () => 'done')).toEqual({ ok: true, value: 'done' });
  });
  it('captures a rejection', async () => {
    const r = await attemptAsync(async () => { throw new Error('offline'); });
    expect(r.ok).toBe(false);
    expect(r.error.message).toBe('offline');
  });
  it('never rejects', async () => {
    await attemptAsync(async () => { throw new Error('x'); });
  });
});

describe('map', () => {
  it('transforms a value', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual({ ok: true, value: 20 });
  });
  it('passes an error through untouched', () => {
    const failure = err(new Error('keep me'));
    const out = map(failure, () => 'never runs');
    expect(out).toBe(failure);
  });
  it('does not swallow a throw from the mapper', () => {
    expect(() => map(ok(1), () => { throw new Error('mapper blew up'); })).toThrow('mapper blew up');
  });
  it('chains', () => {
    const out = map(map(ok(2), (n) => n + 1), (n) => 'n=' + n);
    expect(out).toEqual({ ok: true, value: 'n=3' });
  });
});

describe('mapError', () => {
  it('transforms an error', () => {
    const out = mapError(err(new Error('raw')), (e) => 'wrapped: ' + e.message);
    expect(out).toEqual({ ok: false, error: 'wrapped: raw' });
  });
  it('leaves a success alone', () => {
    const success = ok(1);
    expect(mapError(success, () => 'x')).toBe(success);
  });
});

describe('unwrapOr / unwrap', () => {
  it('unwrapOr returns the value or the fallback', () => {
    expect(unwrapOr(ok('real'), 'fallback')).toBe('real');
    expect(unwrapOr(err(new Error('x')), 'fallback')).toBe('fallback');
  });
  it('unwrap returns the value', () => {
    expect(unwrap(ok(5))).toBe(5);
  });
  it('unwrap throws the original error object', () => {
    const original = new RangeError('out of range');
    let caught;
    try { unwrap(err(original)); } catch (e) { caught = e; }
    expect(caught).toBe(original);
  });
});

describe('all', () => {
  it('collects every value', () => {
    expect(all([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] });
  });
  it('short-circuits on the first error', () => {
    const first = err('first');
    const out = all([ok(1), first, err('second')]);
    expect(out).toBe(first);
  });
  it('handles an empty list', () => {
    expect(all([])).toEqual({ ok: true, value: [] });
  });
  it('composes with attempt for a whole batch', () => {
    const parsed = all(['1', '2', 'oops'].map((raw) => attempt(() => {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error('not a number: ' + raw);
      return n;
    })));
    expect(parsed.ok).toBe(false);
    expect(parsed.error.message).toBe('not a number: oops');
  });
});