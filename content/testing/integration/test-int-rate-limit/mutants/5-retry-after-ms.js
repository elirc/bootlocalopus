import http from 'node:http';

/**
 * GET /search, limited per API key: `limit` requests per fixed window of `windowMs`.
 * A key's window starts at its first request. `now` is injected so tests control time.
 */
export function createApp({ now = Date.now, limit = 5, windowMs = 60_000 } = {}) {
  const windows = new Map(); // apiKey -> { start, count }

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };

  return http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');

    if (pathname === '/health') return send(res, 200, { status: 'ok' }); // never limited

    if (pathname !== '/search') return send(res, 404, { error: { code: 'NOT_FOUND' } });

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return send(res, 401, { error: { code: 'UNAUTHORIZED' } });

    const t = now();
    let win = windows.get(apiKey);
    if (!win || t >= win.start + windowMs) {
      win = { start: t, count: 0 };
      windows.set(apiKey, win);
    }

    if (win.count >= limit) {
      // Rejected requests are not counted: they did no work.
      const retryAfter = win.start + windowMs - t;
      return send(res, 429, { error: { code: 'RATE_LIMITED' } }, {
        'retry-after': String(retryAfter),
        'ratelimit-limit': String(limit),
        'ratelimit-remaining': '0',
      });
    }

    win.count += 1;
    return send(res, 200, { q: searchParams.get('q') ?? '', results: [] }, {
      'ratelimit-limit': String(limit),
      'ratelimit-remaining': String(limit - win.count),
    });
  });
}
