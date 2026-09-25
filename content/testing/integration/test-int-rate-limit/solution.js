async function withApp(options, fn) {
  const server = solution.createApp(options);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const get = async (path, { key } = {}) => {
    const res = await fetch(base + path, { headers: key === undefined ? {} : { 'x-api-key': key } });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(get);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** A clock the test moves by hand. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, set: (ms) => { t = ms; }, advance: (ms) => { t += ms; } };
}

const use = async (get, key, n) => {
  const results = [];
  for (let i = 0; i < n; i++) results.push(await get('/search?q=x', { key }));
  return results;
};

describe('within a window', () => {
  it('allows exactly `limit` requests, counting RateLimit-Remaining down', async () => {
    const clock = fakeClock();
    await withApp({ now: clock.now, limit: 3 }, async (get) => {
      const results = await use(get, 'a', 3);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(results.map((r) => r.headers.get('ratelimit-remaining'))).toEqual(['2', '1', '0']);
      expect(results[0].headers.get('ratelimit-limit')).toBe('3');

      const rejected = await get('/search', { key: 'a' });
      expect(rejected.status).toBe(429);
      expect(rejected.body.error.code).toBe('RATE_LIMITED');
      expect(rejected.headers.get('ratelimit-remaining')).toBe('0');
    });
  });

  it('sends Retry-After in whole seconds, rounded up', async () => {
    const clock = fakeClock(0);
    await withApp({ now: clock.now, limit: 1, windowMs: 60_000 }, async (get) => {
      await get('/search', { key: 'a' });   // window: 0 to 60000
      clock.set(18_500);                    // 41.5 s left
      const rejected = await get('/search', { key: 'a' });
      expect(rejected.status).toBe(429);
      expect(rejected.headers.get('retry-after')).toBe('42');
    });
  });

  it('limits each key on its own', async () => {
    const clock = fakeClock();
    await withApp({ now: clock.now, limit: 2 }, async (get) => {
      await use(get, 'noisy', 2);
      expect((await get('/search', { key: 'noisy' })).status).toBe(429);
      const quiet = await get('/search', { key: 'quiet' });
      expect(quiet.status).toBe(200);
      expect(quiet.headers.get('ratelimit-remaining')).toBe('1');
    });
  });
});

describe('the window boundary', () => {
  it('is still limited 1 ms before the window ends, and open exactly at the end', async () => {
    const clock = fakeClock(0);
    await withApp({ now: clock.now, limit: 2, windowMs: 10_000 }, async (get) => {
      await use(get, 'a', 2);
      clock.set(9_999);
      expect((await get('/search', { key: 'a' })).status).toBe(429);
      clock.set(10_000);
      const fresh = await get('/search', { key: 'a' });
      expect(fresh.status).toBe(200);
      expect(fresh.headers.get('ratelimit-remaining')).toBe('1');
    });
  });

  it('starts the window at the key\'s first request, not at server start', async () => {
    const clock = fakeClock(0);
    await withApp({ now: clock.now, limit: 1, windowMs: 10_000 }, async (get) => {
      clock.set(7_000);
      await get('/search', { key: 'a' });            // window: 7000 to 17000
      clock.set(12_000);
      const rejected = await get('/search', { key: 'a' });
      expect(rejected.status).toBe(429);
      expect(rejected.headers.get('retry-after')).toBe('5');
    });
  });
});

describe('what is not limited', () => {
  it('rejects a request with no key with 401', async () => {
    await withApp({ now: fakeClock().now }, async (get) => {
      const res = await get('/search');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  it('never limits /health', async () => {
    await withApp({ now: fakeClock().now, limit: 1 }, async (get) => {
      for (let i = 0; i < 3; i++) expect((await get('/health')).status).toBe(200);
    });
  });
});
