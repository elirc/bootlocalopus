import http from 'node:http';

describe('the bucket', () => {
  it('allows a burst up to capacity', () => {
    const limiter = solution.createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => 0 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('reports remaining and limit', () => {
    const limiter = solution.createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => 0 });
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 1, limit: 2, retryAfterMs: 0 });
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 0, limit: 2, retryAfterMs: 0 });
    const refused = limiter.check('a');
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.limit).toBe(2);
  });

  it('keeps buckets separate per key', () => {
    const limiter = solution.createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 });
    expect(limiter.check('alice').allowed).toBe(true);
    expect(limiter.check('alice').allowed).toBe(false);
    expect(limiter.check('bob').allowed).toBe(true);
  });

  it('refills over time', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => clock });
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    clock += 1000;
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('counts fractional time', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 1, refillPerSecond: 2, now: () => clock });
    expect(limiter.check('a').allowed).toBe(true);
    clock += 250;   // half a token at 2/s
    expect(limiter.check('a').allowed).toBe(false);
    clock += 250;   // now a full token
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('never refills past capacity', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 2, refillPerSecond: 10, now: () => clock });
    clock += 60_000;
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('reports how long to wait', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => clock });
    limiter.check('a');
    expect(limiter.check('a').retryAfterMs).toBe(1000);
    clock += 400;
    expect(limiter.check('a').retryAfterMs).toBe(600);
  });
});

describe('the middleware', () => {
  const start = async (limiter) => {
    const middleware = solution.rateLimit(limiter, () => 'test-key');
    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    return {
      get: () => fetch('http://127.0.0.1:' + port + '/'),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  it('passes allowed requests through with headers', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 5, refillPerSecond: 1, now: () => 0 }));
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ratelimit-limit')).toBe('5');
      expect(res.headers.get('x-ratelimit-remaining')).toBe('4');
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.close(); }
  });

  it('counts down remaining', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => 0 }));
    try {
      expect((await app.get()).headers.get('x-ratelimit-remaining')).toBe('2');
      expect((await app.get()).headers.get('x-ratelimit-remaining')).toBe('1');
      expect((await app.get()).headers.get('x-ratelimit-remaining')).toBe('0');
    } finally { await app.close(); }
  });

  it('429s with retry-after in seconds once exhausted', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 1, refillPerSecond: 0.5, now: () => 0 }));
    try {
      expect((await app.get()).status).toBe(200);
      const res = await app.get();
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('2');
      expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(await res.json()).toEqual({ error: 'too many requests' });
    } finally { await app.close(); }
  });

  it('sets the limit headers on a refusal too', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 }));
    try {
      await app.get();
      const res = await app.get();
      expect(res.headers.get('x-ratelimit-limit')).toBe('1');
    } finally { await app.close(); }
  });

  it('lets traffic through again after a refill', async () => {
    let clock = 0;
    const app = await start(solution.createRateLimiter({
      capacity: 1, refillPerSecond: 1000, now: () => clock,
    }));
    try {
      expect((await app.get()).status).toBe(200);
      expect((await app.get()).status).toBe(429);
      clock += 10;
      expect((await app.get()).status).toBe(200);
    } finally { await app.close(); }
  });
});