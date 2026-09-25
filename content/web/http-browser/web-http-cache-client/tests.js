const { createHttpCache, HttpError } = solution;

/**
 * A scripted origin server. `script` is a list of responders; each call to
 * fetch uses the next one and records the request headers it received.
 */
const origin = (...script) => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, ifNoneMatch: headers.get('if-none-match') });
    const next = script.shift();
    if (!next) throw new Error('unexpected extra request to ' + url);
    return next();
  };
  return { fetch, calls };
};
const ok = (data, headers = {}) => () =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
const notModified = (headers = {}) => () => new Response(null, { status: 304, headers });
const status = (code) => () => new Response('{"error":"x"}', { status: code, headers: { 'content-type': 'application/json' } });
const clock = (t = 1_000_000) => { const c = () => t; c.advance = (ms) => { t += ms; }; return c; };

describe('revalidation with ETags', () => {
  it('sends If-None-Match and returns the stored data on 304', async () => {
    const server = origin(ok({ n: 1 }, { etag: '"v1"' }), notModified({ etag: '"v1"' }));
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    expect(await cache.get('/api/menu')).toEqual({ n: 1 });
    expect(await cache.get('/api/menu')).toEqual({ n: 1 });
    expect(server.calls).toEqual([
      { url: '/api/menu', ifNoneMatch: null },
      { url: '/api/menu', ifNoneMatch: '"v1"' },
    ]);
  });

  it('replaces the entry when the server sends a new version', async () => {
    const server = origin(ok({ n: 1 }, { etag: '"v1"' }), ok({ n: 2 }, { etag: '"v2"' }), notModified());
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/m');
    expect(await cache.get('/m')).toEqual({ n: 2 });
    expect(await cache.get('/m')).toEqual({ n: 2 });
    expect(server.calls.map((c) => c.ifNoneMatch)).toEqual([null, '"v1"', '"v2"']);
  });

  it('keeps entries per URL', async () => {
    const server = origin(ok('a', { etag: '"a"' }), ok('b', { etag: '"b"' }), notModified(), notModified());
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/a');
    await cache.get('/b');
    expect(await cache.get('/b')).toBe('b');
    expect(await cache.get('/a')).toBe('a');
    expect(server.calls.slice(2)).toEqual([{ url: '/b', ifNoneMatch: '"b"' }, { url: '/a', ifNoneMatch: '"a"' }]);
  });
});

describe('freshness', () => {
  it('does not call fetch at all while max-age lasts', async () => {
    const now = clock();
    const server = origin(ok({ n: 1 }, { 'cache-control': 'public, max-age=60', etag: '"v1"' }), notModified());
    const cache = createHttpCache({ fetch: server.fetch, now });
    await cache.get('/m');
    now.advance(59_999);
    expect(await cache.get('/m')).toEqual({ n: 1 });
    expect(server.calls).toHaveLength(1);
    now.advance(1);
    expect(await cache.get('/m')).toEqual({ n: 1 });
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].ifNoneMatch).toBe('"v1"');
  });

  it('refreshes freshness from the 304\'s own Cache-Control', async () => {
    const now = clock();
    const server = origin(
      ok({ n: 1 }, { 'cache-control': 'max-age=10', etag: '"v1"' }),
      notModified({ 'cache-control': 'max-age=30' }),
      notModified(),
      notModified(),
    );
    const cache = createHttpCache({ fetch: server.fetch, now });
    await cache.get('/m');
    now.advance(10_000);
    await cache.get('/m'); // stale -> 304, fresh for 30 s
    now.advance(29_000);
    await cache.get('/m');
    expect(server.calls).toHaveLength(2);
    now.advance(1_000);
    await cache.get('/m'); // stale again -> 304 without max-age -> always revalidate
    await cache.get('/m');
    expect(server.calls).toHaveLength(4);
  });

  it('treats no-cache as "store, but always revalidate"', async () => {
    const server = origin(ok({ n: 1 }, { 'cache-control': 'no-cache, max-age=600', etag: '"v1"' }), notModified());
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/m');
    expect(await cache.get('/m')).toEqual({ n: 1 });
    expect(server.calls.map((c) => c.ifNoneMatch)).toEqual([null, '"v1"']);
  });

  it('reads directives case-insensitively', async () => {
    const server = origin(ok(1, { 'cache-control': 'Public, MAX-AGE=5' }));
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/m');
    expect(await cache.get('/m')).toBe(1);
    expect(server.calls).toHaveLength(1);
  });

  it('stores a max-age response without an ETag, then refetches unconditionally', async () => {
    const now = clock();
    const server = origin(ok(1, { 'cache-control': 'max-age=5' }), ok(2));
    const cache = createHttpCache({ fetch: server.fetch, now });
    await cache.get('/m');
    now.advance(5_000);
    expect(await cache.get('/m')).toBe(2);
    expect(server.calls[1].ifNoneMatch).toBe(null);
  });
});

describe('what is not stored', () => {
  it('never stores no-store, and drops an existing entry', async () => {
    const server = origin(ok(1, { etag: '"v1"' }), ok(2, { etag: '"v2"', 'cache-control': 'no-store' }), ok(3));
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/me');
    expect(await cache.get('/me')).toBe(2);
    expect(await cache.get('/me')).toBe(3);
    expect(server.calls.map((c) => c.ifNoneMatch)).toEqual([null, '"v1"', null]);
  });

  it('does not store a response with neither ETag nor max-age', async () => {
    const server = origin(ok(1), ok(2));
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/m');
    expect(await cache.get('/m')).toBe(2);
    expect(server.calls.map((c) => c.ifNoneMatch)).toEqual([null, null]);
  });
});

describe('errors', () => {
  it('throws HttpError for a failure status and keeps the entry', async () => {
    const server = origin(ok({ n: 1 }, { etag: '"v1"' }), status(503), notModified());
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    await cache.get('/m');
    let error;
    try { await cache.get('/m'); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(HttpError);
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(503);
    expect(await cache.get('/m')).toEqual({ n: 1 });
    expect(server.calls[2].ifNoneMatch).toBe('"v1"');
  });
});

describe('copies', () => {
  it('hands out copies, so mutating a result cannot corrupt the cache', async () => {
    const now = clock();
    const server = origin(ok({ items: ['a'] }, { etag: '"v1"', 'cache-control': 'max-age=60' }), notModified());
    const cache = createHttpCache({ fetch: server.fetch, now });
    const first = await cache.get('/m');
    first.items.push('mutated');
    const fresh = await cache.get('/m');
    expect(fresh).toEqual({ items: ['a'] });
    fresh.items.push('again');
    now.advance(60_000);
    expect(await cache.get('/m')).toEqual({ items: ['a'] });
  });
});

describe('deduplication', () => {
  it('shares one request between concurrent callers, each getting its own copy', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const server = origin(async () => { await gate; return ok({ items: [1] }, { etag: '"v1"' })(); });
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    const a = cache.get('/m');
    const b = cache.get('/m');
    const c = cache.get('/m');
    release();
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(server.calls).toHaveLength(1);
    expect(ra).toEqual({ items: [1] });
    expect(rb).toEqual({ items: [1] });
    expect(ra).not.toBe(rb);
    expect(rb).not.toBe(rc);
  });

  it('rejects every waiter on failure and does not remember the failure', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const server = origin(async () => { await gate; return status(500)(); }, ok('ok'));
    const cache = createHttpCache({ fetch: server.fetch, now: clock() });
    const settled = Promise.allSettled([cache.get('/m'), cache.get('/m')]);
    release();
    const results = await settled;
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(results[1].reason.status).toBe(500);
    expect(await cache.get('/m')).toBe('ok');
    expect(server.calls).toHaveLength(2);
  });
});
