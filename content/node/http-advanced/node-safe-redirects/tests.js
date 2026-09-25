import http from 'node:http';

const request = (base, path, { method = 'GET', body } = {}) => new Promise((resolve, reject) => {
  const url = new URL(base);
  const req = http.request({ host: url.hostname, port: url.port, path, method, headers: body ? { 'content-type': 'application/json' } : {} }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
  });
  req.setTimeout(3000, () => req.destroy(new Error('the response never completed')));
  req.on('error', reject);
  req.end(body ? JSON.stringify(body) : undefined);
});

const withServer = async (fn) => {
  const handler = solution.createRedirectHandler({ checkPassword: (u, p) => u === 'ada' && p === 'correct horse' });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

const login = { user: 'ada', password: 'correct horse' };

describe('safeNext', () => {
  it('keeps local paths with their query and fragment', () => {
    expect(solution.safeNext('/billing')).toBe('/billing');
    expect(solution.safeNext('/orders?page=2&sort=desc#top')).toBe('/orders?page=2&sort=desc#top');
    expect(solution.safeNext('/')).toBe('/');
  });

  it('rejects absolute URLs and non-paths', () => {
    for (const v of ['https://evil.io', 'http://app.internal/x', 'javascript:alert(1)', 'evil.io', '', 'billing', undefined, null, 42]) {
      expect({ v, r: solution.safeNext(v) }).toEqual({ v, r: '/' });
    }
  });

  it('rejects protocol-relative and backslash tricks', () => {
    for (const v of ['//evil.io', '//evil.io/x', '/\\evil.io', '/\\/evil.io', '///evil.io']) {
      expect({ v, r: solution.safeNext(v) }).toEqual({ v, r: '/' });
    }
  });

  it('rejects control characters that browsers would strip', () => {
    for (const v of ['/\t/evil.io', '/\n/evil.io', '/ok\r\nSet-Cookie: a=1', '/x\u0000']) {
      expect({ v, r: solution.safeNext(v) }).toEqual({ v, r: '/' });
    }
  });

  it('normalises dot segments without leaving the origin', () => {
    expect(solution.safeNext('/a/../b')).toBe('/b');
    expect(solution.safeNext('/../../etc')).toBe('/etc');
  });
});

describe('POST /login', () => {
  it('answers 303 to a safe next', () => withServer(async (base) => {
    const r = await request(base, '/login?next=%2Fbilling%3Ftab%3Dinvoices', { method: 'POST', body: login });
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe('/billing?tab=invoices');
    expect(r.body).toBe('');
  }));

  it('sends an unsafe or missing next to /', () => withServer(async (base) => {
    const evil = await request(base, `/login?next=${encodeURIComponent('//evil.io/login')}`, { method: 'POST', body: login });
    expect(evil.status).toBe(303);
    expect(evil.headers.location).toBe('/');
    const missing = await request(base, '/login', { method: 'POST', body: login });
    expect(missing.headers.location).toBe('/');
  }));

  it('answers 401 for a wrong password', () => withServer(async (base) => {
    const r = await request(base, '/login?next=/billing', { method: 'POST', body: { user: 'ada', password: 'nope' } });
    expect(r.status).toBe(401);
    expect(JSON.parse(r.body)).toEqual({ error: 'invalid credentials' });
    expect(r.headers.location).toBeUndefined();
  }));
});

describe('trailing-slash redirects', () => {
  it('uses 301 for GET and keeps the query string', () => withServer(async (base) => {
    const r = await request(base, '/docs/?q=streams&page=2');
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('/docs?q=streams&page=2');
    const head = await request(base, '/docs/guide/', { method: 'HEAD' });
    expect(head.status).toBe(301);
    expect(head.headers.location).toBe('/docs/guide');
  }));

  it('uses 308 for other methods so the method and body survive', () => withServer(async (base) => {
    const r = await request(base, '/api/orders/', { method: 'POST', body: { item: 1 } });
    expect(r.status).toBe(308);
    expect(r.headers.location).toBe('/api/orders');
  }));

  it('strips several trailing slashes', () => withServer(async (base) => {
    expect((await request(base, '/docs///')).headers.location).toBe('/docs');
  }));

  it('does not turn //host/ into an open redirect', () => withServer(async (base) => {
    const r = await request(base, '//evil.io/');
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('/evil.io');
    const r2 = await request(base, '///evil.io/path/?x=1');
    expect(r2.headers.location).toBe('/evil.io/path?x=1');
  }));

  it('leaves / alone and 404s unknown paths', () => withServer(async (base) => {
    const root = await request(base, '/');
    expect(root.status).toBe(404);
    const other = await request(base, '/docs');
    expect(other.status).toBe(404);
    expect(JSON.parse(other.body)).toEqual({ error: 'not found' });
  }));
});
