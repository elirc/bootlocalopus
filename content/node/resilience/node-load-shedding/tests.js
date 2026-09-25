import http from 'node:http';

const tick = () => new Promise((r) => setImmediate(r));
const until = async (cond, what) => {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error('timed out waiting for ' + what);
};

const withServer = async (opts, fn) => {
  const shedder = solution.createShedder(opts);
  const gates = [];
  let entered = 0;
  let handled = 0;
  const handler = async (req, res) => {
    handled++;
    const path = req.url.split('?')[0];
    if (path === '/slow') {
      entered++;
      await new Promise((resolve) => gates.push(resolve));
    }
    if (path === '/boom') throw new Error('handler bug');
    if (path === '/reject') return Promise.reject(new Error('async bug'));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: path }));
  };
  const server = http.createServer(shedder.wrap(handler));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, priority) => {
    const res = await fetch(base + path, { headers: priority ? { 'x-priority': priority } : {} });
    return { status: res.status, retryAfter: res.headers.get('retry-after'), type: res.headers.get('content-type'), body: await res.json() };
  };
  const outstanding = [];
  const hold = async (n, priority) => {
    const target = entered + n;
    const pending = [];
    for (let i = 0; i < n; i++) pending.push(get('/slow', priority));
    outstanding.push(...pending);
    await until(() => entered >= target, n + ' slow requests');
    return pending;
  };
  const releaseAll = () => { while (gates.length) gates.shift()(); };
  try {
    await fn({ shedder, get, hold, releaseAll, base, counts: () => ({ entered, handled }) });
  } finally {
    releaseAll();
    await Promise.allSettled(outstanding);
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
};

describe('createShedder', () => {
  it('passes requests through below the limit', async () => {
    await withServer({ maxInFlight: 2 }, async ({ get, shedder }) => {
      expect(await get('/fast')).toMatchObject({ status: 200, body: { ok: '/fast' } });
      await until(() => shedder.stats().inFlight === 0, 'release');
      expect(shedder.stats()).toEqual({ inFlight: 0, shed: 0 });
    });
  });

  it('sheds past maxInFlight with 503, Retry-After and no handler call', async () => {
    await withServer({ maxInFlight: 2, retryAfterSec: 3 }, async ({ get, hold, releaseAll, shedder, counts }) => {
      const held = await hold(2);
      expect(shedder.stats().inFlight).toBe(2);
      const before = counts().handled;
      const r = await get('/fast');
      expect(r.status).toBe(503);
      expect(r.retryAfter).toBe('3');
      expect(r.type).toMatch(/application\/json/);
      expect(r.body).toEqual({ error: 'overloaded' });
      expect(counts().handled).toBe(before);
      expect(shedder.stats()).toEqual({ inFlight: 2, shed: 1 });
      releaseAll();
      for (const p of held) expect((await p).status).toBe(200);
      await until(() => shedder.stats().inFlight === 0, 'release');
      expect((await get('/fast')).status).toBe(200);
    });
  });

  it('never sheds or counts health checks', async () => {
    await withServer({ maxInFlight: 1 }, async ({ get, hold, shedder }) => {
      await hold(1);
      for (const path of ['/healthz', '/healthz?verbose=1']) {
        const r = await get(path);
        expect(r.status).toBe(200);
      }
      expect(shedder.stats()).toEqual({ inFlight: 1, shed: 0 });
      expect((await get('/healthz/deep')).status).toBe(503);
    });
  });

  it('honours a custom exempt list', async () => {
    await withServer({ maxInFlight: 1, exempt: ['/ready'] }, async ({ get, hold }) => {
      await hold(1);
      expect((await get('/ready')).status).toBe(200);
      expect((await get('/healthz')).status).toBe(503);
    });
  });

  it('keeps a reserve that only critical requests may use', async () => {
    await withServer({ maxInFlight: 3, criticalReserve: 1 }, async ({ get, hold, shedder }) => {
      await hold(2);
      expect((await get('/fast')).status).toBe(503);
      expect((await get('/fast', 'high')).status).toBe(503);
      expect((await get('/fast', 'Critical')).status).toBe(503);
      await hold(1, 'critical');
      expect(shedder.stats().inFlight).toBe(3);
      expect((await get('/fast', 'critical')).status).toBe(503);
      expect(shedder.stats().shed).toBe(4);
    });
  });

  it('counts a client that hangs up exactly once', async () => {
    await withServer({ maxInFlight: 1 }, async ({ base, shedder, counts, releaseAll, get }) => {
      const req = http.request(base + '/slow');
      req.on('error', () => {});
      req.end();
      await until(() => counts().entered === 1, 'slow request');
      expect(shedder.stats().inFlight).toBe(1);
      req.destroy();
      await until(() => shedder.stats().inFlight === 0, 'disconnect to be counted');
      // The handler finishing later must not count it down a second time.
      releaseAll();
      for (let i = 0; i < 20; i++) await tick();
      expect(shedder.stats().inFlight).toBe(0);
      expect((await get('/fast')).status).toBe(200);
      await until(() => shedder.stats().inFlight === 0, 'release');
      expect(shedder.stats().inFlight).toBe(0);
    });
  });

  it('answers 500 when the handler throws or rejects, and frees the slot', async () => {
    await withServer({ maxInFlight: 1 }, async ({ get, shedder }) => {
      for (const path of ['/boom', '/reject']) {
        const r = await get(path);
        expect(r.status).toBe(500);
        expect(r.body).toEqual({ error: 'internal' });
        await until(() => shedder.stats().inFlight === 0, 'release after error');
      }
      expect((await get('/fast')).status).toBe(200);
    });
  });
});
