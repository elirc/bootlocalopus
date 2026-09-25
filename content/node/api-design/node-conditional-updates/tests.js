import http from 'node:http';

async function start() {
  const store = new Map([
    ['a', { version: 3, data: { title: 'Runbook', body: 'restart it' } }],
    ['b', { version: 1, data: { title: 'Other' } }],
  ]);
  const server = http.createServer(solution.createDocsApi(store));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  const call = async (method, path, { headers = {}, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : undefined };
  };
  return { call, store, port, close: () => new Promise((r) => server.close(r)) };
}

describe('GET', () => {
  it('returns the data with a quoted ETag', async () => {
    const app = await start();
    try {
      const r = await app.call('GET', '/docs/a');
      expect(r.status).toBe(200);
      expect(r.json).toStrictEqual({ data: { title: 'Runbook', body: 'restart it' } });
      expect(r.headers.get('etag')).toBe('"3"');
      expect(r.headers.get('content-type')).toMatch(/application\/json/);
    } finally { await app.close(); }
  });

  it('answers 304 with no body when If-None-Match matches, weakly or in a list', async () => {
    const app = await start();
    try {
      for (const inm of ['"3"', 'W/"3"', '"1", "3"', '"9",W/"3"', '*']) {
        const r = await app.call('GET', '/docs/a', { headers: { 'if-none-match': inm } });
        expect(r.status).toBe(304);
        expect(r.text).toBe('');
        expect(r.headers.get('etag')).toBe('"3"');
      }
    } finally { await app.close(); }
  });

  it('answers 200 when If-None-Match does not match', async () => {
    const app = await start();
    try {
      for (const inm of ['"2"', '"33"', '3', 'W/"2", "4"']) {
        const r = await app.call('GET', '/docs/a', { headers: { 'if-none-match': inm } });
        expect(r.status).toBe(200);
        expect(r.json.data.title).toBe('Runbook');
      }
    } finally { await app.close(); }
  });

  it('answers 404 for unknown ids and routes, 405 for other methods', async () => {
    const app = await start();
    try {
      const missing = await app.call('GET', '/docs/zzz');
      expect(missing.status).toBe(404);
      expect(missing.json.error.code).toBe('NOT_FOUND');
      expect((await app.call('GET', '/elsewhere')).status).toBe(404);
      expect((await app.call('GET', '/docs/a/extra')).status).toBe(404);
      const del = await app.call('DELETE', '/docs/a');
      expect(del.status).toBe(405);
      expect(del.json.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(del.headers.get('allow')).toBe('GET, PUT');
      expect(app.store.has('a')).toBe(true);
    } finally { await app.close(); }
  });
});

describe('PUT', () => {
  it('writes when If-Match matches, bumping the version and the ETag', async () => {
    const app = await start();
    try {
      const r = await app.call('PUT', '/docs/a', { headers: { 'if-match': '"3"' }, body: { data: { title: 'Runbook v2' } } });
      expect(r.status).toBe(200);
      expect(r.json).toStrictEqual({ data: { title: 'Runbook v2' } });
      expect(r.headers.get('etag')).toBe('"4"');
      expect(app.store.get('a')).toStrictEqual({ version: 4, data: { title: 'Runbook v2' } });
      const again = await app.call('GET', '/docs/a');
      expect(again.headers.get('etag')).toBe('"4"');
    } finally { await app.close(); }
  });

  it('accepts * and a list containing the current tag', async () => {
    const app = await start();
    try {
      expect((await app.call('PUT', '/docs/a', { headers: { 'if-match': '*' }, body: { data: { n: 1 } } })).status).toBe(200);
      expect((await app.call('PUT', '/docs/a', { headers: { 'if-match': '"1" , "4"' }, body: { data: { n: 2 } } })).status).toBe(200);
      expect(app.store.get('a').version).toBe(5);
    } finally { await app.close(); }
  });

  it('refuses a stale tag with 412 and the current ETag, changing nothing', async () => {
    const app = await start();
    try {
      const r = await app.call('PUT', '/docs/a', { headers: { 'if-match': '"2"' }, body: { data: { title: 'stale' } } });
      expect(r.status).toBe(412);
      expect(r.json.error.code).toBe('PRECONDITION_FAILED');
      expect(r.headers.get('etag')).toBe('"3"');
      expect(app.store.get('a')).toStrictEqual({ version: 3, data: { title: 'Runbook', body: 'restart it' } });
    } finally { await app.close(); }
  });

  it('uses strong comparison: a weak tag never satisfies If-Match', async () => {
    const app = await start();
    try {
      const r = await app.call('PUT', '/docs/a', { headers: { 'if-match': 'W/"3"' }, body: { data: { title: 'x' } } });
      expect(r.status).toBe(412);
      expect(app.store.get('a').version).toBe(3);
    } finally { await app.close(); }
  });

  it('requires If-Match (428)', async () => {
    const app = await start();
    try {
      const r = await app.call('PUT', '/docs/a', { body: { data: { title: 'blind write' } } });
      expect(r.status).toBe(428);
      expect(r.json.error.code).toBe('PRECONDITION_REQUIRED');
      expect(app.store.get('a').version).toBe(3);
    } finally { await app.close(); }
  });

  it('checks the body first, then existence', async () => {
    const app = await start();
    try {
      for (const body of ['{"data":', '[]', '{"data":[1]}', '{"title":"no envelope"}', '{"data":null}']) {
        const r = await app.call('PUT', '/docs/a', { headers: { 'if-match': '"3"' }, body });
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('INVALID_BODY');
      }
      const missing = await app.call('PUT', '/docs/nope', { body: { data: {} } });
      expect(missing.status).toBe(404);
      expect(app.store.has('nope')).toBe(false);
      expect(app.store.get('a').version).toBe(3);
    } finally { await app.close(); }
  });

  it('prevents the lost update: of two writers holding "3", only one wins', async () => {
    const app = await start();
    try {
      const results = await Promise.all([
        app.call('PUT', '/docs/a', { headers: { 'if-match': '"3"' }, body: { data: { by: 'A' } } }),
        app.call('PUT', '/docs/a', { headers: { 'if-match': '"3"' }, body: { data: { by: 'B' } } }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
      expect(app.store.get('a').version).toBe(4);
    } finally { await app.close(); }
  });

  it('checks If-Match after the body has arrived, not before', async () => {
    const app = await start();
    try {
      // Writer A sends its headers and half its body, then stalls.
      const bodyA = JSON.stringify({ data: { by: 'A' } });
      let resolveA;
      const doneA = new Promise((r) => { resolveA = r; });
      const reqA = http.request({
        host: '127.0.0.1', port: app.port, method: 'PUT', path: '/docs/a',
        headers: { 'content-type': 'application/json', 'if-match': '"3"', 'content-length': Buffer.byteLength(bodyA) },
      }, (res) => {
        let text = '';
        res.on('data', (c) => { text += c; });
        res.on('end', () => resolveA({ status: res.statusCode, text }));
      });
      reqA.on('error', (e) => resolveA({ status: 0, text: String(e) }));
      reqA.write(bodyA.slice(0, 5));
      await new Promise((r) => setTimeout(r, 50));

      // Writer B, holding the same version, completes in the meantime.
      const b = await app.call('PUT', '/docs/a', { headers: { 'if-match': '"3"' }, body: { data: { by: 'B' } } });
      expect(b.status).toBe(200);

      reqA.end(bodyA.slice(5));
      const a = await doneA;
      expect(a.status).toBe(412);
      expect(app.store.get('a')).toStrictEqual({ version: 4, data: { by: 'B' } });
    } finally { await app.close(); }
  });
});
