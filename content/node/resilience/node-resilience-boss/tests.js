import http from 'node:http';

const H = 'x-request-timeout-ms';
const tick = () => new Promise((r) => setImmediate(r));

/**
 * A scripted upstream. script[sku] is a list of behaviours consumed one per
 * request (the last one repeats): { status, body, headers } | 'hang' | 'reset'.
 */
const startUpstream = async (script) => {
  const hits = {};
  const budgets = {};
  const closed = {};
  const server = http.createServer((req, res) => {
    const sku = decodeURIComponent(req.url.replace(/^\/price\//, ''));
    hits[sku] = (hits[sku] ?? 0) + 1;
    (budgets[sku] ??= []).push(req.headers[H]);
    req.on('close', () => { closed[sku] = (closed[sku] ?? 0) + 1; });
    const list = script[sku] ?? [{ status: 404, body: { error: 'nope' } }];
    const step = list.length > 1 ? list.shift() : list[0];
    if (step === 'hang') return;
    if (step === 'reset') return req.socket.destroy();
    res.writeHead(step.status, { 'content-type': 'application/json', ...(step.headers ?? {}) });
    res.end(JSON.stringify(step.body ?? {}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, hits, budgets, closed, url: `http://127.0.0.1:${server.address().port}` };
};

const withGateway = async (script, opts, fn) => {
  const up = await startUpstream(script);
  const slept = [];
  const { server } = solution.createGateway({
    upstream: up.url,
    sleep: async (ms) => { slept.push(ms); },
    random: () => 0.5,
    ...opts,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const quote = async (path, budget, method = 'GET') => {
    const res = await fetch(base + path, { method, headers: budget === undefined ? {} : { [H]: String(budget) } });
    return { status: res.status, retryAfter: res.headers.get('retry-after'), type: res.headers.get('content-type'), body: await res.json() };
  };
  try {
    await fn({ quote, up, slept });
  } finally {
    server.closeAllConnections?.();
    up.server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await new Promise((r) => up.server.close(r));
  }
};

const ok = (price) => ({ status: 200, body: { price } });
const fail = (status, headers) => ({ status, body: { error: 'x' }, headers });

describe('the happy path and the deadline', () => {
  it('proxies a live price and forwards the remaining budget', async () => {
    await withGateway({ lamp: [ok(1999)] }, {}, async ({ quote, up }) => {
      const r = await quote('/quote/lamp');
      expect(r.status).toBe(200);
      expect(r.type).toMatch(/application\/json/);
      expect(r.body).toEqual({ sku: 'lamp', price: 1999, source: 'live' });
      const sent = Number(up.budgets.lamp[0]);
      expect(sent).toBeLessThanOrEqual(1980);
      expect(sent).toBeGreaterThan(1000);
    });
  });

  it('caps the budget and refuses one too small to use', async () => {
    await withGateway({ lamp: [ok(1)] }, {}, async ({ quote, up }) => {
      await quote('/quote/lamp', 999999);
      expect(Number(up.budgets.lamp[0])).toBeLessThanOrEqual(4980);
      expect(Number(up.budgets.lamp[0])).toBeGreaterThan(3000);
      const r = await quote('/quote/lamp', 49);
      expect(r.status).toBe(504);
      expect(r.body).toEqual({ error: 'insufficient-deadline' });
      expect(up.hits.lamp).toBe(1);
    });
  });

  it('gives up at the deadline, aborting the upstream call', async () => {
    await withGateway({ slow: ['hang'] }, {}, async ({ quote, up }) => {
      const r = await quote('/quote/slow', 300);
      expect(r.status).toBe(504);
      expect(r.body).toEqual({ error: 'deadline-exceeded' });
      expect(up.hits.slow).toBe(1);
      for (let i = 0; i < 200 && !up.closed.slow; i++) await tick();
      expect(up.closed.slow).toBe(1);
    });
  });

  it('404s other routes', async () => {
    await withGateway({}, {}, async ({ quote }) => {
      for (const [path, method] of [['/quote/', 'GET'], ['/quote/a/b', 'GET'], ['/quote/a.b', 'GET'], ['/quote/a', 'POST'], ['/', 'GET']]) {
        const r = await quote(path, undefined, method);
        expect([path, method, r.status, r.body]).toEqual([path, method, 404, { error: 'not-found' }]);
      }
    });
  });
});

describe('retries', () => {
  it('retries transient failures with backoff', async () => {
    await withGateway({ flaky: [fail(503), fail(502), ok(5)] }, {}, async ({ quote, up, slept }) => {
      const r = await quote('/quote/flaky');
      expect(r.body).toEqual({ sku: 'flaky', price: 5, source: 'live' });
      expect(up.hits.flaky).toBe(3);
      expect(slept).toEqual([25, 50]);
    });
  });

  it('retries a dropped connection', async () => {
    await withGateway({ reset: ['reset', ok(9)] }, {}, async ({ quote, up }) => {
      const r = await quote('/quote/reset');
      expect(r.body).toEqual({ sku: 'reset', price: 9, source: 'live' });
      expect(up.hits.reset).toBe(2);
    });
  });

  it('honours Retry-After, but only when the deadline leaves room for it', async () => {
    await withGateway({ busy: [fail(429, { 'retry-after': '1' }), ok(3)] }, {}, async ({ quote, slept }) => {
      expect((await quote('/quote/busy', 2000)).body).toEqual({ sku: 'busy', price: 3, source: 'live' });
      expect(slept).toEqual([1000]);
    });
    await withGateway({ busy: [fail(429, { 'retry-after': '1' }), ok(3)] }, {}, async ({ quote, up, slept }) => {
      const r = await quote('/quote/busy', 1000);
      expect(r.status).toBe(502);
      expect(r.body).toEqual({ error: 'upstream-failed' });
      expect(up.hits.busy).toBe(1);
      expect(slept).toEqual([]);
    });
  });

  it('does not retry a 500 or a 404', async () => {
    await withGateway({ bug: [fail(500)], gone: [fail(404)] }, {}, async ({ quote, up }) => {
      expect(await quote('/quote/bug')).toMatchObject({ status: 502, body: { error: 'upstream-failed' } });
      expect(up.hits.bug).toBe(1);
      expect(await quote('/quote/gone')).toMatchObject({ status: 404, body: { error: 'unknown-sku' } });
      expect(up.hits.gone).toBe(1);
    });
  });

  it('stops at maxAttempts', async () => {
    await withGateway({ down: [fail(503)] }, { maxAttempts: 2 }, async ({ quote, up }) => {
      expect((await quote('/quote/down')).status).toBe(502);
      expect(up.hits.down).toBe(2);
    });
  });

  it('shares one retry budget across requests', async () => {
    await withGateway({ down: [fail(503)] }, { minRetries: 3, retryRatio: 0.1 }, async ({ quote, up }) => {
      const hitsAfter = [];
      for (let i = 0; i < 4; i++) {
        expect((await quote('/quote/down')).status).toBe(502);
        hitsAfter.push(up.hits.down);
      }
      // 3 attempts, then 2 (one retry left in the budget), then no retries at all.
      expect(hitsAfter).toEqual([3, 5, 6, 7]);
    });
  });
});

describe('degradation', () => {
  it('serves the last good price, marked stale, when the upstream fails', async () => {
    await withGateway({ lamp: [ok(1999), fail(503)], other: [fail(503)] }, { maxAttempts: 1 }, async ({ quote }) => {
      expect((await quote('/quote/lamp')).body.source).toBe('live');
      expect(await quote('/quote/lamp')).toMatchObject({ status: 200, body: { sku: 'lamp', price: 1999, source: 'stale' } });
      expect((await quote('/quote/other')).status).toBe(502);
    });
  });

  it('serves stale at the deadline too', async () => {
    await withGateway({ lamp: [ok(10), 'hang'] }, {}, async ({ quote }) => {
      await quote('/quote/lamp');
      expect(await quote('/quote/lamp', 200)).toMatchObject({ status: 200, body: { sku: 'lamp', price: 10, source: 'stale' } });
    });
  });

  it('rejects at once when the bulkhead is full, and recovers', async () => {
    await withGateway({ slow: ['hang'], lamp: [ok(1)] }, { maxConcurrent: 2 }, async ({ quote, up }) => {
      const held = [quote('/quote/slow', 700), quote('/quote/slow', 700)];
      for (let i = 0; i < 500 && (up.hits.slow ?? 0) < 2; i++) await tick();
      expect(up.hits.slow).toBe(2);
      const r = await quote('/quote/lamp');
      expect(r.status).toBe(503);
      expect(r.retryAfter).toBe('1');
      expect(r.body).toEqual({ error: 'busy' });
      expect(up.hits.lamp).toBeUndefined();
      for (const p of held) expect((await p).status).toBe(504);
      expect((await quote('/quote/lamp')).status).toBe(200);
    });
  });
});
