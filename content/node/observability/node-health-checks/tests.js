import http from 'node:http';

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

function fakeTimers() {
  const pending = new Map();
  let n = 0;
  return {
    pending,
    setTimeout(fn, ms) { const h = { n: ++n, ms }; pending.set(h, fn); return h; },
    clearTimeout(h) { pending.delete(h); },
    fireAll() { for (const [h, fn] of [...pending]) { pending.delete(h); fn(); } },
  };
}

/** A dependency check the test settles by hand; counts its calls. */
function manualCheck() {
  const calls = [];
  const check = (signal) => new Promise((resolve, reject) => { calls.push({ signal, resolve, reject }); });
  return { check, calls, ok: () => calls.at(-1).resolve(), fail: (m) => calls.at(-1).reject(new Error(m)) };
}

async function start(options) {
  const timers = fakeTimers();
  const clock = { t: 0 };
  const health = solution.createHealth({ timers, now: () => clock.t, ...options });
  const server = http.createServer(health.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, headers: res.headers, json: await res.json() };
  };
  return { health, get, timers, clock, close: () => new Promise((r) => server.close(r)) };
}

/** Start a GET without awaiting it. */
const begin = (app, path) => app.get(path);

describe('liveness', () => {
  it('answers ok without running any check', async () => {
    let ran = 0;
    const app = await start({ checks: [{ name: 'db', check: async () => { ran++; throw new Error('down'); } }] });
    try {
      const r = await app.get('/livez');
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ status: 'ok' });
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(r.headers.get('content-type')).toMatch(/application\/json/);
      expect(ran).toBe(0);
      expect((await app.get('/health')).status).toBe(404);
    } finally { await app.close(); }
  });
});

describe('readiness', () => {
  it('runs checks in parallel and reports ok', async () => {
    const db = manualCheck();
    const cache = manualCheck();
    const app = await start({ checks: [{ name: 'db', check: db.check }, { name: 'cache', check: cache.check }] });
    try {
      const p = begin(app, '/readyz');
      for (let i = 0; i < 40 && (db.calls.length === 0 || cache.calls.length === 0); i++) await new Promise((r) => setTimeout(r, 5));
      expect(db.calls).toHaveLength(1);
      expect(cache.calls).toHaveLength(1);              // started before db finished
      expect(db.calls[0].signal).toBeInstanceOf(AbortSignal);
      db.ok();
      cache.ok();
      const r = await p;
      expect(r.status).toBe(200);
      expect(r.json).toStrictEqual({ status: 'ok', checks: { db: { status: 'ok' }, cache: { status: 'ok' } } });
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(app.timers.pending.size).toBe(0);         // timers cleared
    } finally { await app.close(); }
  });

  it('fails (503) on a critical failure and degrades (200) on a non-critical one', async () => {
    const app = await start({
      cacheMs: 0,
      checks: [
        { name: 'db', check: async () => {} },
        { name: 'search', critical: false, check: async () => { throw new Error('search cluster red'); } },
      ],
    });
    try {
      const r = await app.get('/readyz');
      expect(r.status).toBe(200);
      expect(r.json).toStrictEqual({ status: 'degraded', checks: { db: { status: 'ok' }, search: { status: 'fail', error: 'search cluster red' } } });
    } finally { await app.close(); }

    const app2 = await start({
      checks: [
        { name: 'db', check: () => { throw new Error('ECONNREFUSED'); } },
        { name: 'search', critical: false, check: async () => { throw new Error('red'); } },
      ],
    });
    try {
      const r = await app2.get('/readyz');
      expect(r.status).toBe(503);
      expect(r.json.status).toBe('fail');
      expect(r.json.checks.db).toStrictEqual({ status: 'fail', error: 'ECONNREFUSED' });
    } finally { await app2.close(); }
  });

  it('times a hung check out, aborts its signal, and still answers', async () => {
    const db = manualCheck();
    const app = await start({ timeoutMs: 250, checks: [{ name: 'db', check: db.check }, { name: 'fast', check: async () => {} }] });
    try {
      const p = begin(app, '/readyz');
      for (let i = 0; i < 40 && app.timers.pending.size < 1; i++) await new Promise((r) => setTimeout(r, 5));
      await flush();
      expect([...app.timers.pending.keys()].map((h) => h.ms)).toEqual([250]);   // fast already cleared its own
      app.timers.fireAll();
      const r = await p;
      expect(r.status).toBe(503);
      expect(r.json.checks).toStrictEqual({ db: { status: 'fail', error: 'timeout' }, fast: { status: 'ok' } });
      expect(db.calls[0].signal.aborted).toBe(true);
      db.ok();                                            // a late answer changes nothing
      await flush();
    } finally { await app.close(); }
  });
});

describe('sharing and caching', () => {
  it('shares one evaluation between concurrent probes', async () => {
    const db = manualCheck();
    const app = await start({ checks: [{ name: 'db', check: db.check }] });
    try {
      const a = begin(app, '/readyz');
      const b = begin(app, '/readyz');
      for (let i = 0; i < 40 && db.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 30));
      expect(db.calls).toHaveLength(1);
      db.ok();
      expect((await a).status).toBe(200);
      expect((await b).status).toBe(200);
    } finally { await app.close(); }
  });

  it('reuses a result for cacheMs, then evaluates again', async () => {
    let runs = 0;
    let healthy = true;
    const app = await start({ cacheMs: 5000, checks: [{ name: 'db', check: async () => { runs++; if (!healthy) throw new Error('down'); } }] });
    try {
      expect((await app.get('/readyz')).status).toBe(200);
      healthy = false;
      app.clock.t += 4999;
      expect((await app.get('/readyz')).status).toBe(200);
      expect(runs).toBe(1);
      app.clock.t += 1;
      const r = await app.get('/readyz');
      expect(r.status).toBe(503);
      expect(runs).toBe(2);
    } finally { await app.close(); }
  });
});

describe('draining', () => {
  it('answers 503 draining at once, even with a cached ok, and recovers when unset', async () => {
    let runs = 0;
    const app = await start({ cacheMs: 60_000, checks: [{ name: 'db', check: async () => { runs++; } }] });
    try {
      expect((await app.get('/readyz')).status).toBe(200);
      app.health.setDraining(true);
      const r = await app.get('/readyz');
      expect(r.status).toBe(503);
      expect(r.json).toEqual({ status: 'draining' });
      expect((await app.get('/livez')).status).toBe(200);
      app.health.setDraining(false);
      expect((await app.get('/readyz')).status).toBe(200);
      expect(runs).toBe(1);
    } finally { await app.close(); }
  });
});
