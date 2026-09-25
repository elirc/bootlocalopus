const tick = () => new Promise((r) => setImmediate(r));

/** The promise's outcome if it settles within a few event-loop turns, else 'pending'. */
const soon = async (p) => {
  let result = 'pending';
  p.then((v) => { result = { ok: v }; }, (e) => { result = { err: e }; });
  for (let i = 0; i < 10 && result === 'pending'; i++) await tick();
  return result;
};

const fakeTimers = () => {
  let next = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = ++next; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    fire(ms) {
      for (const [id, t] of [...pending]) if (t.ms === ms) { pending.delete(id); t.fn(); }
    },
    pending,
  };
};

/** A controllable dependency. Aborting a call rejects it, like a real fetch. */
const dep = () => {
  const calls = [];
  const fn = (id, signal) => new Promise((resolve, reject) => {
    const call = { id, signal, resolve, reject };
    calls.push(call);
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
  });
  return { fn, calls, last: () => calls[calls.length - 1] };
};

const setup = (opts = {}) => {
  const timers = fakeTimers();
  const catalog = dep();
  const reviews = dep();
  const recs = dep();
  const page = solution.createProductPage({
    catalog: catalog.fn, reviews: reviews.fn, recommendations: recs.fn,
    timeouts: { reviews: 300, recommendations: 200 }, timers, ...opts,
  });
  return { page, timers, catalog, reviews, recs };
};

const PRODUCT = { id: 'p1', name: 'Lamp' };

describe('getPage', () => {
  it('starts all three calls at once and returns everything when all succeed', async () => {
    const { page, timers, catalog, reviews, recs } = setup();
    const p = page.getPage('p1');
    await tick();
    expect([catalog.calls.length, reviews.calls.length, recs.calls.length]).toEqual([1, 1, 1]);
    expect(reviews.last().id).toBe('p1');
    expect(reviews.last().signal).not.toBe(recs.last().signal);
    expect([...timers.pending.values()].map((t) => t.ms).sort()).toEqual([200, 300]);
    reviews.last().resolve(['great']);
    recs.last().resolve(['bulb']);
    catalog.last().resolve(PRODUCT);
    expect(await soon(p)).toEqual({ ok: { product: PRODUCT, reviews: ['great'], recommendations: ['bulb'], degraded: [] } });
    expect(timers.pending.size).toBe(0);
  });

  it('fails when the catalog fails, and aborts the optional calls', async () => {
    const { page, catalog, reviews, recs } = setup();
    const p = page.getPage('p1');
    await tick();
    const boom = new Error('catalog down');
    catalog.last().reject(boom);
    const r = await soon(p);
    expect(r.err).toBe(boom);
    expect(reviews.last().signal.aborted).toBe(true);
    expect(recs.last().signal.aborted).toBe(true);
  });

  it('times out a slow optional dependency, aborts it, and serves an empty list', async () => {
    const { page, timers, catalog, reviews, recs } = setup();
    const p = page.getPage('p1');
    await tick();
    catalog.last().resolve(PRODUCT);
    reviews.last().resolve(['ok']);
    expect(await soon(p)).toBe('pending'); // still waiting for recommendations
    timers.fire(200);
    expect(recs.last().signal.aborted).toBe(true);
    expect(await soon(p)).toEqual({ ok: { product: PRODUCT, reviews: ['ok'], recommendations: [], degraded: ['recommendations:empty'] } });
  });

  it('uses each dependency\'s own timeout', async () => {
    const { page, timers, catalog, reviews, recs } = setup();
    const p = page.getPage('p1');
    await tick();
    catalog.last().resolve(PRODUCT);
    timers.fire(200);
    expect(recs.last().signal.aborted).toBe(true);
    expect(reviews.last().signal.aborted).toBe(false);
    reviews.last().resolve(['late but in time']);
    expect((await soon(p)).ok.reviews).toEqual(['late but in time']);
  });

  it('falls back to the last good value, marked stale, per product', async () => {
    const { page, timers, catalog, reviews, recs } = setup();
    const first = page.getPage('p1');
    await tick();
    catalog.last().resolve(PRODUCT);
    reviews.last().resolve(['r1']);
    recs.last().resolve(['c1']);
    await soon(first);

    const second = page.getPage('p1');
    await tick();
    catalog.last().resolve(PRODUCT);
    reviews.last().reject(new Error('reviews 500'));
    timers.fire(200);
    expect(await soon(second)).toEqual({ ok: { product: PRODUCT, reviews: ['r1'], recommendations: ['c1'], degraded: ['reviews:stale', 'recommendations:stale'] } });

    const other = page.getPage('p2');
    await tick();
    catalog.last().resolve({ id: 'p2' });
    reviews.last().reject(new Error('down'));
    recs.last().resolve(['c2']);
    expect(await soon(other)).toEqual({ ok: { product: { id: 'p2' }, reviews: [], recommendations: ['c2'], degraded: ['reviews:empty'] } });
  });

  it('refreshes the last good value on every success', async () => {
    const { page, timers, catalog, reviews, recs } = setup();
    for (const value of [['old'], ['new']]) {
      const p = page.getPage('p1');
      await tick();
      catalog.last().resolve(PRODUCT);
      reviews.last().resolve(value);
      recs.last().resolve([]);
      await soon(p);
    }
    const p = page.getPage('p1');
    await tick();
    catalog.last().resolve(PRODUCT);
    timers.fire(300);
    recs.last().resolve([]);
    expect((await soon(p)).ok.reviews).toEqual(['new']);
  });

  it('treats a synchronous throw from an optional dependency as a failure', async () => {
    const timers = fakeTimers();
    const page = solution.createProductPage({
      catalog: async () => PRODUCT,
      reviews: () => { throw new Error('sync'); },
      recommendations: async () => ['x'],
      timers,
    });
    expect(await soon(page.getPage('p1'))).toEqual({ ok: { product: PRODUCT, reviews: [], recommendations: ['x'], degraded: ['reviews:empty'] } });
    expect(timers.pending.size).toBe(0);
  });

  it('keeps at most staleEntries products, forgetting the one stored longest ago', async () => {
    const timers = fakeTimers();
    let fail = false;
    const page = solution.createProductPage({
      catalog: async (id) => ({ id }),
      reviews: async (id) => { if (fail) throw new Error('down'); return ['review of ' + id]; },
      recommendations: async () => [],
      staleEntries: 2,
      timers,
    });
    for (const id of ['a', 'b', 'a', 'c']) await soon(page.getPage(id)); // a refreshed after b, so b is oldest
    fail = true;
    expect((await soon(page.getPage('a'))).ok.degraded).toEqual(['reviews:stale']);
    expect((await soon(page.getPage('c'))).ok.degraded).toEqual(['reviews:stale']);
    expect((await soon(page.getPage('b'))).ok.degraded).toEqual(['reviews:empty']);
  });
});
