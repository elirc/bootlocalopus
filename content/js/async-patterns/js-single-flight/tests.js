const { SingleFlight } = solution;
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('coalescing', () => {
  it('concurrent callers for one key share a single call', async () => {
    const sf = new SingleFlight();
    let calls = 0;
    const d = deferred();
    const fn = () => { calls++; return d.promise; };
    const ps = [sf.run('user:1', fn), sf.run('user:1', fn), sf.run('user:1', fn)];
    await tick();
    expect(calls).toBe(1);
    expect(sf.size).toBe(1);
    d.resolve({ id: 1 });
    const results = await Promise.all(ps);
    expect(results).toEqual([{ id: 1 }, { id: 1 }, { id: 1 }]);
    expect(results[0]).toBe(results[2]);
  });

  it('returns the very same promise to concurrent callers', () => {
    const sf = new SingleFlight();
    const d = deferred();
    const a = sf.run('k', () => d.promise);
    const b = sf.run('k', () => { throw new Error('must not be called'); });
    expect(a).toBe(b);
    d.resolve();
  });

  it('different keys run independently', async () => {
    const sf = new SingleFlight();
    const seen = [];
    const [a, b] = await Promise.all([
      sf.run('a', async () => { seen.push('a'); return 1; }),
      sf.run('b', async () => { seen.push('b'); return 2; }),
    ]);
    expect([a, b]).toEqual([1, 2]);
    expect(seen.sort()).toEqual(['a', 'b']);
  });

  it('forgets the key once the call has settled (no result caching)', async () => {
    const sf = new SingleFlight();
    let calls = 0;
    const fn = async () => ++calls;
    expect(await sf.run('k', fn)).toBe(1);
    await tick();
    expect(sf.size).toBe(0);
    expect(await sf.run('k', fn)).toBe(2);
  });
});

describe('failures', () => {
  it('shares a rejection with every concurrent caller, then retries fresh', async () => {
    const sf = new SingleFlight();
    const d = deferred();
    const p1 = sf.run('k', () => d.promise);
    const p2 = sf.run('k', () => d.promise);
    d.reject(new Error('db timeout'));
    await expect(p1).rejects.toThrow('db timeout');
    await expect(p2).rejects.toThrow('db timeout');
    await tick();
    expect(sf.size).toBe(0);
    expect(await sf.run('k', async () => 'recovered')).toBe('recovered');
  });

  it('turns a synchronous throw into a rejection and does not keep the key', async () => {
    const sf = new SingleFlight();
    let p;
    expect(() => { p = sf.run('k', () => { throw new TypeError('bad key'); }); }).not.toThrow();
    await expect(p).rejects.toThrow('bad key');
    await tick();
    expect(sf.size).toBe(0);
  });

  it('a rejected call whose caller handles it causes no unhandled rejection', async () => {
    // An orphan promise from cleanup (e.g. `promise.finally(...)` that nobody
    // awaits) would reject unhandled here and fail this test.
    const sf = new SingleFlight();
    await sf.run('k', async () => { throw new Error('handled by caller'); }).catch(() => {});
    await tick();
    await tick();
    expect(sf.size).toBe(0);
  });
});

describe('forget', () => {
  it('forces a fresh call while the old one is still in flight', async () => {
    const sf = new SingleFlight();
    const old = deferred();
    const fresh = deferred();
    const p1 = sf.run('k', () => old.promise);
    sf.forget('k');
    expect(sf.size).toBe(0);
    const p2 = sf.run('k', () => fresh.promise);
    expect(p2).not.toBe(p1);
    old.resolve('old');
    fresh.resolve('new');
    expect(await p1).toBe('old');
    expect(await p2).toBe('new');
  });

  it('the old call settling does not evict the newer entry', async () => {
    const sf = new SingleFlight();
    const old = deferred();
    const fresh = deferred();
    const p1 = sf.run('k', () => old.promise);
    sf.forget('k');
    const p2 = sf.run('k', () => fresh.promise);
    old.resolve('old');
    await p1;
    await tick();
    expect(sf.size).toBe(1);
    const p3 = sf.run('k', () => { throw new Error('must share the in-flight call'); });
    expect(p3).toBe(p2);
    fresh.resolve('new');
    expect(await p3).toBe('new');
  });

  it('forgetting an unknown key is a no-op', () => {
    const sf = new SingleFlight();
    expect(() => sf.forget('nope')).not.toThrow();
    expect(sf.size).toBe(0);
  });
});
