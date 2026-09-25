import http from 'node:http';

/** Raw request helper: fetch() would add its own caching headers in some runtimes. */
const request = (base, path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request(`${base}${path}`, { method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
  });
  req.setTimeout(3000, () => req.destroy(new Error('the response never completed: does content-length match the bytes actually sent?')));
  req.on('error', reject);
  req.end();
});

const NOW = Date.UTC(2024, 4, 20, 12, 0, 0);
const UPDATED = new Date(Date.UTC(2024, 4, 1, 9, 30, 15, 734)); // note the milliseconds

const withServer = async (fn, docs = { readme: { body: 'Hello, conditional world', updatedAt: UPDATED } }) => {
  const store = { get: (id) => docs[id] };
  const server = http.createServer(solution.createDocHandler(store, { now: () => NOW }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

const httpDate = (ms) => new Date(ms).toUTCString();

describe('createDocHandler', () => {
  it('serves the document with Last-Modified and a strong ETag', () => withServer(async (base) => {
    const r = await request(base, '/docs/readme');
    expect(r.status).toBe(200);
    expect(r.body).toBe('Hello, conditional world');
    expect(r.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(r.headers['last-modified']).toBe('Wed, 01 May 2024 09:30:15 GMT');
    expect(r.headers.etag).toMatch(/^"[^"]+"$/);
  }));

  it('gives different documents different ETags and the same document the same one', () => withServer(async (base) => {
    const a1 = await request(base, '/docs/a');
    const a2 = await request(base, '/docs/a');
    const b = await request(base, '/docs/b');
    expect(a1.headers.etag).toBe(a2.headers.etag);
    expect(a1.headers.etag === b.headers.etag).toBe(false);
  }, { a: { body: 'alpha', updatedAt: UPDATED }, b: { body: 'beta', updatedAt: UPDATED } }));

  it('answers 304 when echoing Last-Modified back, despite the milliseconds', () => withServer(async (base) => {
    const first = await request(base, '/docs/readme');
    const r = await request(base, '/docs/readme', { headers: { 'if-modified-since': first.headers['last-modified'] } });
    expect(r.status).toBe(304);
    expect(r.body).toBe('');
    expect(r.headers['last-modified']).toBe(first.headers['last-modified']);
    expect(r.headers.etag).toBe(first.headers.etag);
  }));

  it('answers 304 for a later date and 200 for an earlier one', () => withServer(async (base) => {
    const later = await request(base, '/docs/readme', { headers: { 'if-modified-since': httpDate(Date.UTC(2024, 4, 10)) } });
    expect(later.status).toBe(304);
    const earlier = await request(base, '/docs/readme', { headers: { 'if-modified-since': 'Wed, 01 May 2024 09:30:14 GMT' } });
    expect(earlier.status).toBe(200);
    expect(earlier.body).toBe('Hello, conditional world');
  }));

  it('ignores an invalid or future If-Modified-Since', () => withServer(async (base) => {
    const invalid = await request(base, '/docs/readme', { headers: { 'if-modified-since': 'yesterday-ish' } });
    expect(invalid.status).toBe(200);
    const future = await request(base, '/docs/readme', { headers: { 'if-modified-since': httpDate(NOW + 3600_000) } });
    expect(future.status).toBe(200);
    const exactlyNow = await request(base, '/docs/readme', { headers: { 'if-modified-since': httpDate(NOW) } });
    expect(exactlyNow.status).toBe(304);
  }));

  it('lets If-None-Match decide on its own when present', () => withServer(async (base) => {
    const { headers } = await request(base, '/docs/readme');
    const fresh = httpDate(Date.UTC(2024, 4, 10));
    const stale = 'Wed, 01 May 2024 09:00:00 GMT';
    const mismatch = await request(base, '/docs/readme', { headers: { 'if-none-match': '"something-else"', 'if-modified-since': fresh } });
    expect(mismatch.status).toBe(200);
    const matched = await request(base, '/docs/readme', { headers: { 'if-none-match': headers.etag, 'if-modified-since': stale } });
    expect(matched.status).toBe(304);
  }));

  it('matches If-None-Match lists, weak tags and *', () => withServer(async (base) => {
    const { headers } = await request(base, '/docs/readme');
    const list = await request(base, '/docs/readme', { headers: { 'if-none-match': `"old1", W/${headers.etag} , "old2"` } });
    expect(list.status).toBe(304);
    const star = await request(base, '/docs/readme', { headers: { 'if-none-match': '*' } });
    expect(star.status).toBe(304);
  }));

  it('supports HEAD with the same headers and no body', () => withServer(async (base) => {
    const get = await request(base, '/docs/readme');
    const head = await request(base, '/docs/readme', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers.etag).toBe(get.headers.etag);
    expect(head.headers['last-modified']).toBe(get.headers['last-modified']);
    const head304 = await request(base, '/docs/readme', { method: 'HEAD', headers: { 'if-none-match': get.headers.etag } });
    expect(head304.status).toBe(304);
  }));

  it('does not apply conditionals to other methods, and 404s unknown documents', () => withServer(async (base) => {
    const put = await request(base, '/docs/readme', { method: 'PUT', headers: { 'if-none-match': '*' } });
    expect(put.status).toBe(405);
    expect(put.headers.allow).toBe('GET, HEAD');
    const missing = await request(base, '/docs/nope', { headers: { 'if-none-match': '*' } });
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body)).toEqual({ error: 'not found' });
    expect((await request(base, '/other')).status).toBe(404);
  }));
});
