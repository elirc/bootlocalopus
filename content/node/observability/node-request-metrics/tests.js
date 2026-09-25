import http from 'node:http';

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

/** Start the app with a manual clock; handlers can advance it with `clock.t += ms`. */
async function start(extraRoutes = []) {
  const clock = { t: 1_000 };
  const seen = [];
  const routes = [
    { method: 'GET', path: '/users/:id', handler: (req, res) => { seen.push(req.params); clock.t += 30; json(res, 200, { id: req.params.id }); } },
    { method: 'GET', path: '/users/:id/orders/:orderId', handler: (req, res) => { seen.push(req.params); json(res, 200, req.params); } },
    { method: 'POST', path: '/users', handler: async (req, res) => { clock.t += 700; json(res, 201, {}); } },
    { method: 'GET', path: '/boom', handler: async () => { clock.t += 5; throw new Error('db down'); } },
    ...extraRoutes,
  ];
  const server = http.createServer(solution.createApp(routes, { now: () => clock.t }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  const call = async (method, path) => {
    const res = await fetch(base + path, { method });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text };
  };
  /** Sample lines of /metrics as a Map from series to number. */
  const samples = async () => {
    const r = await call('GET', '/metrics');
    const map = new Map();
    for (const line of r.text.split('\n')) {
      if (line === '' || line.startsWith('#')) continue;
      const i = line.lastIndexOf(' ');
      map.set(line.slice(0, i), Number(line.slice(i + 1)));
    }
    return { map, response: r };
  };
  return { call, samples, clock, seen, port, close: () => new Promise((r) => server.close(r)) };
}

const series = (map, prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)).sort();

describe('routing', () => {
  it('matches templates, sets req.params, ignores the query string, and 404s the rest', async () => {
    const app = await start();
    try {
      expect((await app.call('GET', '/users/42?expand=orders')).status).toBe(200);
      expect((await app.call('GET', '/users/7/orders/o-9')).status).toBe(200);
      expect(app.seen).toEqual([{ id: '42' }, { id: '7', orderId: 'o-9' }]);
      for (const path of ['/users', '/users/1/orders', '/nope', '/users/1/extra/x']) {
        const r = await app.call('GET', path);
        expect(r.status).toBe(404);
        expect(JSON.parse(r.text)).toEqual({ error: { code: 'NOT_FOUND' } });
      }
      expect((await app.call('DELETE', '/users/1')).status).toBe(404);
    } finally { await app.close(); }
  });

  it('answers 500 when a handler throws', async () => {
    const app = await start();
    try {
      const r = await app.call('GET', '/boom');
      expect(r.status).toBe(500);
      expect(JSON.parse(r.text)).toEqual({ error: { code: 'INTERNAL' } });
    } finally { await app.close(); }
  });
});

describe('/metrics', () => {
  it('counts requests by method, route template and status', async () => {
    const app = await start();
    try {
      await app.call('GET', '/users/1');
      await app.call('GET', '/users/2');
      await app.call('GET', '/users/3?x=1');
      await app.call('POST', '/users');
      await app.call('GET', '/boom');
      await app.call('GET', '/wp-login.php');
      await app.call('GET', '/.env');
      const { map, response } = await app.samples();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4');
      expect(series(map, 'http_requests_total')).toEqual([
        'http_requests_total{method="GET",route="/boom",status="500"}',
        'http_requests_total{method="GET",route="/users/:id",status="200"}',
        'http_requests_total{method="GET",route="unmatched",status="404"}',
        'http_requests_total{method="POST",route="/users",status="201"}',
      ]);
      expect(map.get('http_requests_total{method="GET",route="/users/:id",status="200"}')).toBe(3);
      expect(map.get('http_requests_total{method="GET",route="unmatched",status="404"}')).toBe(2);
    } finally { await app.close(); }
  });

  it('does not count scrapes of /metrics itself', async () => {
    const app = await start();
    try {
      await app.samples();
      const { map } = await app.samples();
      expect(series(map, 'http_requests_total')).toEqual([]);
      expect(map.get('http_requests_in_flight')).toBe(0);
    } finally { await app.close(); }
  });

  it('maps unknown methods to "other"', async () => {
    const app = await start();
    try {
      const status = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: app.port, method: 'PURGE', path: '/users/1' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(404);
      const { map } = await app.samples();
      expect(series(map, 'http_requests_total')).toEqual(['http_requests_total{method="other",route="unmatched",status="404"}']);
    } finally { await app.close(); }
  });

  it('records durations in seconds into cumulative buckets per method and route', async () => {
    const app = await start();
    try {
      await app.call('GET', '/users/1');     // 0.03 s
      await app.call('GET', '/users/2');     // 0.03 s
      await app.call('POST', '/users');      // 0.7 s
      const { map } = await app.samples();
      const g = 'method="GET",route="/users/:id"';
      expect([0.05, 0.1, 0.25, 0.5, 1, '+Inf'].map((le) => map.get(`http_request_duration_seconds_bucket{${g},le="${le}"}`))).toEqual([2, 2, 2, 2, 2, 2]);
      expect(map.get(`http_request_duration_seconds_count{${g}}`)).toBe(2);
      expect(map.get(`http_request_duration_seconds_sum{${g}}`)).toBeCloseTo(0.06, 10);
      const p = 'method="POST",route="/users"';
      expect([0.05, 0.1, 0.25, 0.5, 1, '+Inf'].map((le) => map.get(`http_request_duration_seconds_bucket{${p},le="${le}"}`))).toEqual([0, 0, 0, 0, 1, 1]);
      expect(map.get(`http_request_duration_seconds_sum{${p}}`)).toBeCloseTo(0.7, 10);
    } finally { await app.close(); }
  });

  it('times until the response finishes, not until the handler returns', async () => {
    let finishLater;
    const app = await start([
      { method: 'GET', path: '/export', handler: (req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.write('part 1\n');
        finishLater = () => res.end('part 2\n');
      } },
    ]);
    try {
      const pending = app.call('GET', '/export');
      for (let i = 0; i < 200 && !finishLater; i++) await new Promise((r) => setTimeout(r, 5));
      const during = await app.samples();
      expect(during.map.get('http_requests_in_flight')).toBe(1);
      expect(series(during.map, 'http_requests_total')).toEqual([]);
      app.clock.t += 250;
      finishLater();
      await pending;
      const { map } = await app.samples();
      const e = 'method="GET",route="/export"';
      expect(map.get(`http_request_duration_seconds_bucket{${e},le="0.1"}`)).toBe(0);
      expect(map.get(`http_request_duration_seconds_bucket{${e},le="0.25"}`)).toBe(1);
      expect(map.get(`http_requests_total{${e},status="200"}`)).toBe(1);
      expect(map.get('http_requests_in_flight')).toBe(0);
    } finally { await app.close(); }
  });

  it('counts a bound as inside its bucket', async () => {
    const app = await start([{ method: 'GET', path: '/exact', handler: (req, res) => { app.clock.t += 100; json(res, 200, {}); } }]);
    try {
      await app.call('GET', '/exact');
      const { map } = await app.samples();
      expect(map.get('http_request_duration_seconds_bucket{method="GET",route="/exact",le="0.1"}')).toBe(1);
    } finally { await app.close(); }
  });
});
