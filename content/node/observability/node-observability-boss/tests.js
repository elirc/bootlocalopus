import http from 'node:http';

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const T = '4bf92f3577b34da6a3ce929d0e0e4736';
const P = '00f067aa0ba902b7';

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

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

async function start({ routes = [], ...options } = {}) {
  const clock = { t: 0 };
  const reports = [];
  const timers = fakeTimers();
  let t = 0;
  let s = 0;
  const ids = { traceId: () => (++t).toString(16).padStart(32, 'a'), spanId: () => (++s).toString(16).padStart(16, 'b') };
  let svc;
  const baseRoutes = [
    { method: 'GET', path: '/orders/:id', handler: async (req, res) => {
      clock.t += 60;
      await new Promise((r) => setTimeout(r, 2));
      json(res, 200, { id: req.params.id, outgoing: svc.outgoingHeaders() });
    } },
    { method: 'POST', path: '/orders', handler: async () => { clock.t += 700; const e = new Error('quantity must be positive'); e.status = 422; e.code = 'VALIDATION_FAILED'; throw e; } },
    { method: 'GET', path: '/orders/:id/invoice', handler: async () => { clock.t += 5; throw new Error('pdf renderer at 10.0.0.7 crashed'); } },
    ...routes,
  ];
  svc = solution.createService({ routes: baseRoutes, report: (e) => { reports.push(e); }, now: () => clock.t, ids, timers, ...options });
  const server = http.createServer(svc.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, path, headers = {}) => {
    const res = await fetch(base + path, { method, headers });
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, body };
  };
  const samples = async () => {
    const r = await call('GET', '/metrics');
    const map = new Map();
    for (const line of String(r.body).split('\n')) {
      if (line === '' || line.startsWith('#')) continue;
      const i = line.lastIndexOf(' ');
      map.set(line.slice(0, i), Number(line.slice(i + 1)));
    }
    return { map, response: r };
  };
  return { svc, call, samples, clock, reports, timers, close: () => new Promise((r) => server.close(r)) };
}

const keys = (map, prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)).sort();

describe('tracing', () => {
  it('continues a valid trace, sets x-trace-id, and propagates this span downstream', async () => {
    const app = await start();
    try {
      const r = await app.call('GET', '/orders/7', { traceparent: `00-${T}-${P}-01` });
      expect(r.status).toBe(200);
      expect(r.headers.get('x-trace-id')).toBe(T);
      expect(r.body).toStrictEqual({ id: '7', outgoing: { traceparent: `00-${T}-${'b'.repeat(15)}1-01` } });
    } finally { await app.close(); }
  });

  it('starts a new trace for a missing or invalid header, and keeps the sampled flag', async () => {
    const app = await start();
    try {
      const a = await app.call('GET', '/orders/1', { traceparent: `00-${T.toUpperCase()}-${P}-01` });
      expect(a.headers.get('x-trace-id')).toBe('a'.repeat(31) + '1');
      expect(a.body.outgoing.traceparent).toBe(`00-${'a'.repeat(31)}1-${'b'.repeat(15)}1-01`);
      const b = await app.call('GET', '/orders/2', { traceparent: `00-${T}-${P}-00` });
      expect(b.body.outgoing.traceparent).toBe(`00-${T}-${'b'.repeat(15)}2-00`);
      expect(app.svc.outgoingHeaders()).toStrictEqual({});
    } finally { await app.close(); }
  });

  it('keeps concurrent requests apart', async () => {
    const app = await start({ routes: [
      { method: 'GET', path: '/slow/:n', handler: async (req, res) => {
        await new Promise((r) => setTimeout(r, Number(req.params.n)));
        json(res, 200, app.svc.outgoingHeaders());
      } },
    ] });
    try {
      const T2 = 'c'.repeat(32);
      const [a, b] = await Promise.all([
        app.call('GET', '/slow/60', { traceparent: `00-${T}-${P}-01` }),
        app.call('GET', '/slow/5', { traceparent: `00-${T2}-${P}-01` }),
      ]);
      expect(a.body.traceparent.split('-')[1]).toBe(T);
      expect(b.body.traceparent.split('-')[1]).toBe(T2);
    } finally { await app.close(); }
  });
});

describe('errors', () => {
  it('answers client errors with their status and does not report them', async () => {
    const app = await start();
    try {
      const r = await app.call('POST', '/orders');
      expect(r.status).toBe(422);
      expect(r.body).toStrictEqual({ error: { code: 'VALIDATION_FAILED', message: 'quantity must be positive' } });
      expect(app.reports).toEqual([]);
    } finally { await app.close(); }
  });

  it('hides server errors from the client and reports them with the route and trace id', async () => {
    const app = await start();
    try {
      const r = await app.call('GET', '/orders/9/invoice', { traceparent: `00-${T}-${P}-01` });
      expect(r.status).toBe(500);
      expect(r.body).toStrictEqual({ error: { code: 'INTERNAL', message: 'internal error' } });
      expect(app.reports).toStrictEqual([{ name: 'Error', message: 'pdf renderer at 10.0.0.7 crashed', method: 'GET', route: '/orders/:id/invoice', traceId: T }]);
    } finally { await app.close(); }
  });

  it('survives a report function that throws or rejects', async () => {
    for (const report of [() => { throw new Error('tracker down'); }, async () => { throw new Error('tracker down'); }]) {
      const app = await start({ report });
      try {
        expect((await app.call('GET', '/orders/9/invoice')).status).toBe(500);
        expect((await app.call('GET', '/orders/1')).status).toBe(200);
      } finally { await app.close(); }
    }
  });

  it('404s unknown routes', async () => {
    const app = await start();
    try {
      const r = await app.call('GET', '/admin.php');
      expect(r.status).toBe(404);
      expect(r.body).toStrictEqual({ error: { code: 'NOT_FOUND' } });
    } finally { await app.close(); }
  });
});

describe('metrics', () => {
  it('records bounded labels and durations until finish, and skips infra endpoints', async () => {
    const app = await start();
    try {
      await app.call('GET', '/orders/1');
      await app.call('GET', '/orders/2?x=1');
      await app.call('POST', '/orders');
      await app.call('GET', '/orders/3/invoice');
      await app.call('GET', '/nope/deeper');
      await app.call('GET', '/livez');
      await app.call('GET', '/readyz');
      await app.samples();
      const { map, response } = await app.samples();
      expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4');
      expect(keys(map, 'http_requests_total')).toEqual([
        'http_requests_total{method="GET",route="/orders/:id",status="200"}',
        'http_requests_total{method="GET",route="/orders/:id/invoice",status="500"}',
        'http_requests_total{method="GET",route="unmatched",status="404"}',
        'http_requests_total{method="POST",route="/orders",status="422"}',
      ]);
      expect(map.get('http_requests_total{method="GET",route="/orders/:id",status="200"}')).toBe(2);
      const g = 'method="GET",route="/orders/:id"';
      expect(['0.1', '0.5', '1', '+Inf'].map((le) => map.get(`http_request_duration_seconds_bucket{${g},le="${le}"}`))).toEqual([2, 2, 2, 2]);
      expect(map.get(`http_request_duration_seconds_sum{${g}}`)).toBeCloseTo(0.12, 10);
      expect(map.get(`http_request_duration_seconds_count{${g}}`)).toBe(2);
      const p = 'method="POST",route="/orders"';
      expect(['0.1', '0.5', '1', '+Inf'].map((le) => map.get(`http_request_duration_seconds_bucket{${p},le="${le}"}`))).toEqual([0, 0, 1, 1]);
    } finally { await app.close(); }
  });

  it('maps unknown methods to other', async () => {
    const app = await start();
    try {
      await app.call('PURGE', '/orders/1');
      const { map } = await app.samples();
      expect(keys(map, 'http_requests_total')).toEqual(['http_requests_total{method="other",route="unmatched",status="404"}']);
    } finally { await app.close(); }
  });
});

describe('probes', () => {
  it('/livez runs no checks', async () => {
    let ran = 0;
    const app = await start({ checks: [{ name: 'db', check: async () => { ran++; throw new Error('down'); } }] });
    try {
      const r = await app.call('GET', '/livez');
      expect(r.status).toBe(200);
      expect(r.body).toStrictEqual({ status: 'ok' });
      expect(ran).toBe(0);
    } finally { await app.close(); }
  });

  it('/readyz runs checks in parallel with timeouts and grades them', async () => {
    let releaseDb;
    let searchRan = false;
    const signals = [];
    const app = await start({
      checkTimeoutMs: 300,
      checks: [
        { name: 'db', check: (signal) => { signals.push(signal); return new Promise((r) => { releaseDb = r; }); } },
        { name: 'search', critical: false, check: async () => { searchRan = true; throw new Error('cluster red'); } },
      ],
    });
    try {
      const pending = app.call('GET', '/readyz');
      for (let i = 0; i < 40 && !releaseDb; i++) await new Promise((r) => setTimeout(r, 5));
      await flush();
      expect(searchRan).toBe(true);                      // started while db was still pending
      expect([...app.timers.pending.keys()].map((h) => h.ms)).toEqual([300]);
      app.timers.fireAll();
      const r = await pending;
      expect(r.status).toBe(503);
      expect(r.body).toStrictEqual({ status: 'fail', checks: { db: { status: 'fail', error: 'timeout' }, search: { status: 'fail', error: 'cluster red' } } });
      expect(signals[0].aborted).toBe(true);
    } finally { await app.close(); }
  });

  it('/readyz degrades on non-critical failures and drains on demand', async () => {
    const app = await start({ checks: [{ name: 'db', check: async () => {} }, { name: 'search', critical: false, check: async () => { throw new Error('red'); } }] });
    try {
      const r = await app.call('GET', '/readyz?verbose=1');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('degraded');
      app.svc.setDraining(true);
      const d = await app.call('GET', '/readyz');
      expect(d.status).toBe(503);
      expect(d.body).toStrictEqual({ status: 'draining' });
      app.svc.setDraining(false);
      expect((await app.call('GET', '/readyz')).status).toBe(200);
    } finally { await app.close(); }
  });
});
