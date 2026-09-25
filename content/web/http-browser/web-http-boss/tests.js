import http from 'node:http';

const ADMIN = 'https://admin.shop.com';
const PRODUCTS = [
  { id: 'mug', name: 'Mug', price: 900 },
  { id: 'tee', name: 'T-shirt', price: 1800 },
];

const request = (port, method, path, headers = {}, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { text += c; });
    res.on('end', () => {
      let json;
      try { json = JSON.parse(text); } catch { json = undefined; }
      resolve({ status: res.statusCode, headers: res.headers, text, json });
    });
  });
  req.on('error', reject);
  req.end(body);
});

const withApi = async (fn) => {
  const server = http.createServer(solution.createApi({ origins: [ADMIN], products: PRODUCTS.map((p) => ({ ...p })) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const { port } = server.address();
    await fn((method, path, headers, body) => request(port, method, path, headers, body), port);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

const JSON_H = { 'content-type': 'application/json' };
const put = (send, id, ifMatchTag, body, extra = {}) =>
  send('PUT', '/products/' + id, { origin: ADMIN, ...JSON_H, ...(ifMatchTag === undefined ? {} : { 'if-match': ifMatchTag }), ...extra },
    typeof body === 'string' ? body : JSON.stringify(body));
const varyHasOrigin = (h) => (h.vary ?? '').toLowerCase().split(',').map((s) => s.trim()).includes('origin');
const hasCors = (h) => h['access-control-allow-origin'] === ADMIN
  && h['access-control-allow-credentials'] === 'true'
  && (h['access-control-expose-headers'] ?? '').toLowerCase().split(',').map((s) => s.trim()).includes('etag');

describe('reading', () => {
  it('returns the product with its ETag and no-cache', async () => {
    await withApi(async (send) => {
      const res = await send('GET', '/products/mug', { origin: ADMIN });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.json).toEqual({ id: 'mug', name: 'Mug', price: 900 });
      expect(res.headers.etag).toBe('"mug-v1"');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(hasCors(res.headers)).toBe(true);
      expect(varyHasOrigin(res.headers)).toBe(true);
    });
  });

  it('answers 304 to a matching If-None-Match (weak comparison, lists, *)', async () => {
    await withApi(async (send) => {
      for (const inm of ['"mug-v1"', 'W/"mug-v1"', '"x", "mug-v1"', '*']) {
        const res = await send('GET', '/products/mug', { origin: ADMIN, 'if-none-match': inm });
        expect(res.status).toBe(304);
        expect(res.text).toBe('');
        expect(res.headers.etag).toBe('"mug-v1"');
        expect(hasCors(res.headers)).toBe(true);
      }
      const other = await send('GET', '/products/tee', { 'if-none-match': '"mug-v1"' });
      expect(other.status).toBe(200);
    });
  });

  it('404s unknown products and paths, with CORS headers', async () => {
    await withApi(async (send) => {
      for (const path of ['/products/nope', '/products', '/orders/1', '/products/mug/extra']) {
        const res = await send('GET', path, { origin: ADMIN });
        expect(res.status).toBe(404);
        expect(res.json).toEqual({ error: 'not found' });
        expect(hasCors(res.headers)).toBe(true);
      }
    });
  });

  it('405s other methods with Allow', async () => {
    await withApi(async (send) => {
      const res = await send('DELETE', '/products/mug', { origin: ADMIN });
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('GET, PUT');
      expect(res.json).toEqual({ error: 'method not allowed' });
      expect(hasCors(res.headers)).toBe(true);
    });
  });
});

describe('CORS', () => {
  it('answers the editor\'s preflight for a PUT', async () => {
    await withApi(async (send) => {
      const res = await send('OPTIONS', '/products/mug', {
        origin: ADMIN,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type,if-match',
      });
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(res.headers['access-control-allow-origin']).toBe(ADMIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toBe('GET, PUT');
      expect(res.headers['access-control-allow-headers']).toBe('Content-Type, If-Match, If-None-Match');
      expect(res.headers['access-control-max-age']).toBe('600');
      expect(varyHasOrigin(res.headers)).toBe(true);
    });
  });

  it('answers a preflight for any path, before routing', async () => {
    await withApi(async (send) => {
      const res = await send('OPTIONS', '/products/does-not-exist', { origin: ADMIN, 'access-control-request-method': 'GET' });
      expect(res.status).toBe(204);
    });
  });

  it('refuses bad preflights with 403 and no allow headers', async () => {
    await withApi(async (send) => {
      const cases = [
        { origin: 'https://admin.shop.com.evil.io', 'access-control-request-method': 'PUT' },
        { origin: ADMIN, 'access-control-request-method': 'DELETE' },
        { origin: ADMIN, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type, x-admin' },
      ];
      for (const headers of cases) {
        const res = await send('OPTIONS', '/products/mug', headers);
        expect(res.status).toBe(403);
        expect(res.text).toBe('');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.headers['access-control-allow-methods']).toBeUndefined();
      }
    });
  });

  it('serves other origins without CORS headers', async () => {
    await withApi(async (send) => {
      const res = await send('GET', '/products/mug', { origin: 'https://evil.io' });
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(varyHasOrigin(res.headers)).toBe(true);
    });
  });
});

describe('saving', () => {
  it('saves with a matching If-Match and returns the new ETag', async () => {
    await withApi(async (send) => {
      const res = await put(send, 'mug', '"mug-v1"', { name: 'Big mug', price: 1100 });
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ id: 'mug', name: 'Big mug', price: 1100 });
      expect(res.headers.etag).toBe('"mug-v2"');
      expect(hasCors(res.headers)).toBe(true);
      const after = await send('GET', '/products/mug', {});
      expect(after.json).toEqual({ id: 'mug', name: 'Big mug', price: 1100 });
      expect(after.headers.etag).toBe('"mug-v2"');
    });
  });

  it('prevents the lost update: a second save with the old ETag gets 412', async () => {
    await withApi(async (send) => {
      expect((await put(send, 'mug', '"mug-v1"', { name: 'Alice', price: 1 })).status).toBe(200);
      const bob = await put(send, 'mug', '"mug-v1"', { name: 'Bob', price: 2 });
      expect(bob.status).toBe(412);
      expect(bob.json).toEqual({ error: 'precondition failed' });
      expect(hasCors(bob.headers)).toBe(true);
      expect((await send('GET', '/products/mug', {})).json.name).toBe('Alice');
    });
  });

  it('requires If-Match (428), and uses the strong comparison', async () => {
    await withApi(async (send) => {
      const missing = await put(send, 'mug', undefined, { name: 'X', price: 1 });
      expect(missing.status).toBe(428);
      expect(missing.json).toEqual({ error: 'precondition required' });
      expect(hasCors(missing.headers)).toBe(true);
      expect((await put(send, 'mug', 'W/"mug-v1"', { name: 'X', price: 1 })).status).toBe(412);
      expect((await put(send, 'mug', '"tee-v1"', { name: 'X', price: 1 })).status).toBe(412);
      expect((await send('GET', '/products/mug', {})).headers.etag).toBe('"mug-v1"');
    });
  });

  it('accepts * and a list containing the current ETag', async () => {
    await withApi(async (send) => {
      expect((await put(send, 'mug', '*', { name: 'A', price: 1 })).headers.etag).toBe('"mug-v2"');
      expect((await put(send, 'mug', '"mug-v1", "mug-v2"', { name: 'B', price: 2 })).headers.etag).toBe('"mug-v3"');
    });
  });

  it('checks the precondition before the media type and the body', async () => {
    await withApi(async (send) => {
      expect((await put(send, 'mug', '"stale"', 'not json', { 'content-type': 'text/plain' })).status).toBe(412);
      expect((await put(send, 'mug', undefined, 'not json', { 'content-type': 'text/plain' })).status).toBe(428);
    });
  });

  it('415s a non-JSON media type', async () => {
    await withApi(async (send) => {
      const res = await put(send, 'mug', '"mug-v1"', 'name=X&price=1', { 'content-type': 'application/x-www-form-urlencoded' });
      expect(res.status).toBe(415);
      expect(res.json).toEqual({ error: 'unsupported media type' });
      const withCharset = await put(send, 'mug', '"mug-v1"', { name: 'X', price: 1 }, { 'content-type': 'Application/JSON; charset=utf-8' });
      expect(withCharset.status).toBe(200);
    });
  });

  it('400s invalid bodies without changing the product', async () => {
    await withApi(async (send) => {
      for (const body of ['{oops', 'null', '[]', { name: '', price: 1 }, { name: 'X', price: -1 }, { name: 'X', price: 9.5 }, { name: 'X', price: '10' }, { price: 1 }]) {
        const res = await put(send, 'mug', '"mug-v1"', body);
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ error: 'invalid body' });
      }
      expect((await send('GET', '/products/mug', {})).headers.etag).toBe('"mug-v1"');
    });
  });

  it('404s a PUT to an unknown product', async () => {
    await withApi(async (send) => {
      expect((await put(send, 'nope', '*', { name: 'X', price: 1 })).status).toBe(404);
    });
  });

  it('lets exactly one of two concurrent saves with the same ETag win', async () => {
    await withApi(async (send, port) => {
      // Both requests send their headers with `Expect: 100-continue`. Node
      // answers `100 Continue` as it hands each request to the handler, so
      // once both have been continued, both handlers are running and waiting
      // for their bodies — only then are the bodies sent.
      const pending = ['One', 'Two'].map((name, i) => {
        let continued;
        const ready = new Promise((r) => { continued = r; });
        const response = new Promise((resolve, reject) => {
          const req = http.request({
            host: '127.0.0.1', port, method: 'PUT', path: '/products/tee',
            headers: { origin: ADMIN, ...JSON_H, 'if-match': '"tee-v1"', expect: '100-continue' },
          }, (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { text += c; });
            res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : undefined }));
          });
          req.on('continue', () => continued(req));
          req.on('error', reject);
          req.flushHeaders();
        });
        return { name, price: i + 1, ready, response };
      });
      const reqs = await Promise.all(pending.map((p) => p.ready));
      reqs.forEach((req, i) => req.end(JSON.stringify({ name: pending[i].name, price: pending[i].price })));
      const results = await Promise.all(pending.map((p) => p.response));
      expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
      const winner = results.find((r) => r.status === 200).json.name;
      const now = await send('GET', '/products/tee', {});
      expect(now.json.name).toBe(winner);
      expect(now.headers.etag).toBe('"tee-v2"');
    });
  });
});
