/** Let an implementation that awaits before calling the loader get there. */
const flush = () => new Promise((r) => setImmediate(r));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

/** A loader that records calls and returns `value(key)` immediately. */
const counting = (value = (key) => 'v:' + key) => {
  const calls = [];
  const loader = (key) => { calls.push(key); return Promise.resolve(value(key)); };
  return { loader, calls };
};

/** A loader whose every call waits for the test to settle it. */
const manual = () => {
  const pending = [];
  const loader = (key) => { const d = deferred(); pending.push({ key, ...d }); return d.promise; };
  return { loader, pending };
};

/** A call that must be served from cache: fails (instead of hanging) if it starts a load. */
const expectHit = async (cache, key, loader, pending, value) => {
  const before = pending.length;
  const p = cache.getOrLoad(key, loader);
  await flush();
  expect(pending.length).toBe(before);
  expect(await p).toBe(value);
};

const outcome = (p) => p.then((value) => ({ value }), (error) => ({ error }));

describe('caching', () => {
  it('loads on a miss and serves the next call from cache', async () => {
    const cache = solution.createCache();
    const { loader, calls } = counting();
    expect(await cache.getOrLoad('a', loader)).toBe('v:a');
    expect(await cache.getOrLoad('a', loader)).toBe('v:a');
    expect(calls).toEqual(['a']);
    expect(cache.size).toBe(1);
  });

  it('keeps keys apart', async () => {
    const cache = solution.createCache();
    const { loader, calls } = counting();
    expect(await cache.getOrLoad('a', loader)).toBe('v:a');
    expect(await cache.getOrLoad('b', loader)).toBe('v:b');
    expect(calls).toEqual(['a', 'b']);
  });

  it('caches undefined, null and 0 like any other value', async () => {
    const cache = solution.createCache();
    for (const [key, value] of [['u', undefined], ['n', null], ['z', 0], ['f', false]]) {
      let calls = 0;
      const loader = async () => { calls++; return value; };
      expect(await cache.getOrLoad(key, loader)).toBe(value);
      expect(await cache.getOrLoad(key, loader)).toBe(value);
      expect({ key, calls }).toEqual({ key, calls: 1 });
    }
  });

  it('always returns a promise, even for a hit', async () => {
    const cache = solution.createCache();
    const { loader } = counting();
    await cache.getOrLoad('a', loader);
    const hit = cache.getOrLoad('a', loader);
    expect(typeof hit.then).toBe('function');
    expect(await hit).toBe('v:a');
  });
});

describe('single-flight', () => {
  it('turns 100 concurrent misses into one load', async () => {
    const cache = solution.createCache();
    const { loader, pending } = manual();
    const all = Promise.all(Array.from({ length: 100 }, () => cache.getOrLoad('hot', loader)));
    await flush();
    expect(pending).toHaveLength(1);
    expect(pending[0].key).toBe('hot');
    pending[0].resolve({ n: 1 });
    const values = await all;
    expect(values).toHaveLength(100);
    expect(values.every((v) => v === values[0])).toBe(true);
    expect(values[0]).toEqual({ n: 1 });
    expect(pending).toHaveLength(1);
  });

  it('does not count a pending load in size', async () => {
    const cache = solution.createCache();
    const { loader, pending } = manual();
    const p = cache.getOrLoad('a', loader);
    expect(cache.size).toBe(0);
    await flush();
    pending[0].resolve(1);
    await p;
    expect(cache.size).toBe(1);
  });

  it('loads different keys concurrently', async () => {
    const cache = solution.createCache();
    const { loader, pending } = manual();
    const a = cache.getOrLoad('a', loader);
    const b = cache.getOrLoad('b', loader);
    await flush();
    expect(pending.map((p) => p.key)).toEqual(['a', 'b']);
    pending[1].resolve('B');
    pending[0].resolve('A');
    expect(await Promise.all([a, b])).toEqual(['A', 'B']);
  });
});

describe('failures', () => {
  it('shares a rejection with every waiter and does not cache it', async () => {
    const cache = solution.createCache();
    const { loader, pending } = manual();
    const waiters = [1, 2, 3].map(() => outcome(cache.getOrLoad('a', loader)));
    const boom = new Error('db down');
    await flush();
    expect(pending).toHaveLength(1);
    pending[0].reject(boom);
    for (const r of await Promise.all(waiters)) expect(r.error).toBe(boom);
    expect(cache.size).toBe(0);

    const retry = cache.getOrLoad('a', loader);
    await flush();
    expect(pending).toHaveLength(2);
    pending[1].resolve('ok');
    expect(await retry).toBe('ok');
    await expectHit(cache, 'a', loader, pending, 'ok');
    expect(pending).toHaveLength(2);
  });

  it('turns a synchronous throw into a rejection, and retries next time', async () => {
    const cache = solution.createCache();
    let calls = 0;
    const loader = () => { calls++; if (calls === 1) throw new Error('sync boom'); return 'fine'; };
    let returned;
    expect(() => { returned = cache.getOrLoad('a', loader); }).not.toThrow();
    expect((await outcome(returned)).error.message).toBe('sync boom');
    expect(await cache.getOrLoad('a', loader)).toBe('fine');
    expect(calls).toBe(2);
  });
});

describe('ttl', () => {
  it('serves fresh entries and reloads stale ones', async () => {
    let clock = 1_000;
    const cache = solution.createCache({ ttlMs: 500, now: () => clock });
    let version = 0;
    const loader = async () => ++version;
    expect(await cache.getOrLoad('a', loader)).toBe(1);
    clock += 499;
    expect(await cache.getOrLoad('a', loader)).toBe(1);
    clock += 1;
    expect(await cache.getOrLoad('a', loader)).toBe(2);
    expect(version).toBe(2);
  });

  it('timestamps an entry when its load finishes, not when it started', async () => {
    let clock = 0;
    const cache = solution.createCache({ ttlMs: 100, now: () => clock });
    const { loader, pending } = manual();
    const first = cache.getOrLoad('a', loader);
    clock = 1_000;          // a slow load
    await flush();
    pending[0].resolve('A');
    await first;
    clock = 1_050;          // 50 ms after it was stored: still fresh
    await expectHit(cache, 'a', loader, pending, 'A');
    expect(pending).toHaveLength(1);
  });

  it('single-flights the reload of a stale entry', async () => {
    let clock = 0;
    const cache = solution.createCache({ ttlMs: 10, now: () => clock });
    const { loader, pending } = manual();
    const first = cache.getOrLoad('a', loader);
    await flush();
    pending[0].resolve(1);
    await first;
    clock = 50;
    const again = [cache.getOrLoad('a', loader), cache.getOrLoad('a', loader)];
    await flush();
    expect(pending).toHaveLength(2);
    pending[1].resolve(2);
    expect(await Promise.all(again)).toEqual([2, 2]);
  });
});

describe('eviction', () => {
  it('holds at most max entries', async () => {
    const cache = solution.createCache({ max: 3 });
    const { loader } = counting();
    for (const k of ['a', 'b', 'c', 'd', 'e']) await cache.getOrLoad(k, loader);
    expect(cache.size).toBe(3);
  });

  it('evicts the least recently used, counting hits as use', async () => {
    const cache = solution.createCache({ max: 2 });
    const { loader, calls } = counting();
    await cache.getOrLoad('a', loader);
    await cache.getOrLoad('b', loader);
    await cache.getOrLoad('a', loader);   // a is now more recent than b
    await cache.getOrLoad('c', loader);   // evicts b
    expect(calls).toEqual(['a', 'b', 'c']);
    await cache.getOrLoad('a', loader);   // hit
    expect(calls).toEqual(['a', 'b', 'c']);
    await cache.getOrLoad('b', loader);   // miss: it was evicted
    expect(calls).toEqual(['a', 'b', 'c', 'b']);
    expect(cache.size).toBe(2);
  });
});

describe('delete', () => {
  it('removes a stored entry', async () => {
    const cache = solution.createCache();
    const { loader, calls } = counting();
    await cache.getOrLoad('a', loader);
    cache.delete('a');
    expect(cache.size).toBe(0);
    await cache.getOrLoad('a', loader);
    expect(calls).toEqual(['a', 'a']);
  });

  it('does not let a load that was in flight during delete() repopulate the cache', async () => {
    const cache = solution.createCache();
    const { loader, pending } = manual();
    const stale = cache.getOrLoad('a', loader);
    cache.delete('a');                      // e.g. the row was just updated

    const fresh = cache.getOrLoad('a', loader);
    await flush();
    expect(pending).toHaveLength(2);        // a new load, not joined to the old one

    pending[0].resolve('old');
    expect(await stale).toBe('old');        // its own waiters still get an answer
    pending[1].resolve('new');
    expect(await fresh).toBe('new');
    await expectHit(cache, 'a', loader, pending, 'new');
    expect(pending).toHaveLength(2);
  });

  it('does not store a result whose load was deleted, even with no newer load', async () => {
    const cache = solution.createCache();
    const { loader, pending } = manual();
    const stale = cache.getOrLoad('a', loader);
    cache.delete('a');
    await flush();
    pending[0].resolve('old');
    expect(await stale).toBe('old');
    expect(cache.size).toBe(0);
    const next = cache.getOrLoad('a', loader);
    await flush();
    expect(pending).toHaveLength(2);
    pending[1].resolve('new');
    expect(await next).toBe('new');
  });
});
