// Same behaviour: stores the reset time instead of the start, counts remaining down instead of used up.
import http from 'node:http';

export function createApp({ now = () => Date.now(), limit = 5, windowMs = 60_000 } = {}) {
  const buckets = new Map(); // apiKey -> { resetAt, remaining }

  function reply(res, status, payload, headers) {
    res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  }

  function take(key, at) {
    let bucket = buckets.get(key);
    if (bucket === undefined || at >= bucket.resetAt) {
      bucket = { resetAt: at + windowMs, remaining: limit };
      buckets.set(key, bucket);
    }
    if (bucket.remaining === 0) return { ok: false, waitMs: bucket.resetAt - at };
    bucket.remaining -= 1;
    return { ok: true, remaining: bucket.remaining };
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://h');
    switch (url.pathname) {
      case '/health':
        return reply(res, 200, { status: 'ok' });
      case '/search': {
        const key = req.headers['x-api-key'];
        if (typeof key !== 'string' || key === '') return reply(res, 401, { error: { code: 'UNAUTHORIZED', message: 'api key required' } });
        const result = take(key, now());
        if (!result.ok) {
          return reply(res, 429, { error: { code: 'RATE_LIMITED', message: 'slow down' } }, {
            'RateLimit-Remaining': '0',
            'RateLimit-Limit': `${limit}`,
            'Retry-After': `${Math.ceil(result.waitMs / 1000)}`,
          });
        }
        return reply(res, 200, { results: [], q: url.searchParams.get('q') || '' }, {
          'RateLimit-Remaining': `${result.remaining}`,
          'RateLimit-Limit': `${limit}`,
        });
      }
      default:
        return reply(res, 404, { error: { code: 'NOT_FOUND', message: 'nothing here' } });
    }
  });
}
