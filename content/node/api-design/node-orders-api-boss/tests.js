import http from 'node:http';

async function start() {
  const clock = { t: Date.UTC(2025, 0, 1) };
  const server = http.createServer(solution.createOrdersApi({ now: () => clock.t }));
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
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined };
  };
  /** Create an order, advancing the clock one second first. */
  const create = async (customer, totalCents, headers) => {
    clock.t += 1000;
    const r = await call('POST', '/orders', { headers, body: { data: { customer, totalCents } } });
    if (r.status !== 201) fail('create failed with ' + r.status + ' ' + JSON.stringify(r.json));
    return r.json.data;
  };
  const patch = (id, body, headers = {}) =>
    call('PATCH', '/orders/' + id, { headers: { 'content-type': 'application/merge-patch+json', ...headers }, body });
  return { call, create, patch, clock, port, close: () => new Promise((r) => server.close(r)) };
}

/** Follow nextCursor to the end; returns every page's ids. */
async function allPages(app, query) {
  const pages = [];
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const sep = query ? '&' : '';
    const r = await app.call('GET', '/orders?' + query + (cursor ? sep + 'cursor=' + cursor : ''));
    if (r.status !== 200) fail('page failed: ' + r.status + ' ' + JSON.stringify(r.json));
    pages.push(r.json.data.map((o) => o.id));
    cursor = r.json.nextCursor;
    if (cursor === null) return pages;
  }
  return fail('pagination never ended');
}

describe('routing', () => {
  it('answers 404 for unknown paths and 405 with allow for wrong methods', async () => {
    const app = await start();
    try {
      for (const path of ['/', '/customers', '/orders/ord_1/items']) {
        const r = await app.call('GET', path);
        expect(r.status).toBe(404);
        expect(r.json.error.code).toBe('NOT_FOUND');
      }
      const del = await app.call('DELETE', '/orders');
      expect(del.status).toBe(405);
      expect(del.json.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(del.headers.get('allow')).toBe('GET, POST');
      const put = await app.call('PUT', '/orders/ord_1', { body: {} });
      expect(put.status).toBe(405);
      expect(put.headers.get('allow')).toBe('GET, PATCH');
    } finally { await app.close(); }
  });
});

describe('POST /orders', () => {
  it('creates a pending order with location and etag', async () => {
    const app = await start();
    try {
      const r = await app.call('POST', '/orders', { body: { data: { customer: 'acme', totalCents: 1250 } } });
      expect(r.status).toBe(201);
      expect(r.headers.get('content-type')).toMatch(/application\/json/);
      expect(r.json).toStrictEqual({ data: { id: 'ord_1', customer: 'acme', totalCents: 1250, status: 'pending', createdAt: '2025-01-01T00:00:00.000Z' } });
      expect(r.headers.get('location')).toBe('/orders/ord_1');
      expect(r.headers.get('etag')).toBe('"1"');
      const got = await app.call('GET', '/orders/ord_1');
      expect(got.status).toBe(200);
      expect(got.json.data).toStrictEqual(r.json.data);
      expect(got.headers.get('etag')).toBe('"1"');
      expect((await app.call('GET', '/orders/ord_9')).status).toBe(404);
    } finally { await app.close(); }
  });

  it('rejects a bad body with 400 and bad fields with 422, collecting every problem', async () => {
    const app = await start();
    try {
      for (const body of ['{"data":', '{}', '{"data":[1]}', 'null']) {
        const r = await app.call('POST', '/orders', { body });
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('INVALID_BODY');
      }
      const r = await app.call('POST', '/orders', { body: { data: { customer: '', totalCents: 1.5, status: 'paid', coupon: 'X' } } });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(r.json.error.details).sort()).toEqual(['coupon', 'customer', 'status', 'totalCents']);
      for (const totalCents of [0, -5, '100', 2 ** 53]) {
        const bad = await app.call('POST', '/orders', { body: { data: { customer: 'a', totalCents } } });
        expect(Object.keys(bad.json.error.details)).toEqual(['totalCents']);
      }
      expect((await app.call('GET', '/orders')).json.data).toEqual([]);
    } finally { await app.close(); }
  });

  it('replays a retried create instead of creating twice', async () => {
    const app = await start();
    try {
      const body = JSON.stringify({ data: { customer: 'acme', totalCents: 500 } });
      const first = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k-1' }, body });
      const again = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k-1' }, body });
      expect(first.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.json).toStrictEqual(first.json);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(again.headers.get('location')).toBe('/orders/ord_1');
      expect(again.headers.get('etag')).toBe('"1"');
      expect(first.headers.get('idempotent-replayed')).toBeNull();
      expect((await app.call('GET', '/orders')).json.data).toHaveLength(1);

      const other = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k-2' }, body });
      expect(other.json.data.id).toBe('ord_2');
    } finally { await app.close(); }
  });

  it('refuses a reused key, a malformed key, and does not remember failed creates', async () => {
    const app = await start();
    try {
      await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k' }, body: { data: { customer: 'a', totalCents: 1 } } });
      const reused = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k' }, body: { data: { customer: 'a', totalCents: 2 } } });
      expect(reused.status).toBe(422);
      expect(reused.json.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

      const malformed = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'has space' }, body: { data: { customer: 'a', totalCents: 1 } } });
      expect(malformed.status).toBe(400);
      expect(malformed.json.error.code).toBe('INVALID_IDEMPOTENCY_KEY');

      const invalid = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k2' }, body: { data: { customer: '', totalCents: 1 } } });
      expect(invalid.status).toBe(422);
      const fixed = await app.call('POST', '/orders', { headers: { 'idempotency-key': 'k2' }, body: { data: { customer: 'b', totalCents: 1 } } });
      expect(fixed.status).toBe(201);
      expect(fixed.headers.get('idempotent-replayed')).toBeNull();
      expect((await app.call('GET', '/orders')).json.data).toHaveLength(2);
    } finally { await app.close(); }
  });
});

describe('GET /orders', () => {
  it('defaults to newest first, 20 per page, with a null cursor on the last page', async () => {
    const app = await start();
    try {
      for (let i = 1; i <= 3; i++) await app.create('c' + i, i * 100);
      const r = await app.call('GET', '/orders');
      expect(r.status).toBe(200);
      expect(r.json.data.map((o) => o.id)).toEqual(['ord_3', 'ord_2', 'ord_1']);
      expect(r.json.nextCursor).toBeNull();
    } finally { await app.close(); }
  });

  it('filters by status, status[in] and total bounds', async () => {
    const app = await start();
    try {
      const a = await app.create('a', 100);
      const b = await app.create('b', 200);
      const c = await app.create('c', 300);
      const pay = await app.patch(b.id, { status: 'paid' }, { 'if-match': '"1"' });
      expect(pay.status).toBe(200);
      await app.patch(c.id, { status: 'cancelled' }, { 'if-match': '"1"' });
      const ids = async (q) => (await app.call('GET', '/orders?' + q)).json.data.map((o) => o.id).sort();
      expect(await ids('status=paid')).toEqual([b.id]);
      expect(await ids('status[in]=pending,cancelled')).toEqual([a.id, c.id]);
      expect(await ids('totalCents[gte]=200&totalCents[lte]=300')).toEqual([b.id, c.id]);
      expect(await ids('totalCents[lte]=200&status=pending')).toEqual([a.id]);
    } finally { await app.close(); }
  });

  it('sorts with ties broken by creation order, and pages without repeats or gaps', async () => {
    const app = await start();
    try {
      const totals = [300, 100, 300, 200, 100, 300, 200];
      for (const [i, t] of totals.entries()) await app.create('c' + i, t);
      const pages = await allPages(app, 'sort=-totalCents&limit=2');
      expect(pages.map((p) => p.length)).toEqual([2, 2, 2, 1]);
      expect(pages.flat()).toEqual(['ord_1', 'ord_3', 'ord_6', 'ord_4', 'ord_7', 'ord_2', 'ord_5']);
      const asc = await allPages(app, 'sort=totalCents,-createdAt&limit=3');
      expect(asc.flat()).toEqual(['ord_5', 'ord_2', 'ord_7', 'ord_4', 'ord_6', 'ord_3', 'ord_1']);
    } finally { await app.close(); }
  });

  it('returns null, not a cursor to an empty page, when a page ends the list exactly', async () => {
    const app = await start();
    try {
      for (let i = 0; i < 4; i++) await app.create('c', 100);
      const first = await app.call('GET', '/orders?limit=2');
      expect(first.json.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
      const second = await app.call('GET', '/orders?limit=2&cursor=' + first.json.nextCursor);
      expect(second.json.data).toHaveLength(2);
      expect(second.json.nextCursor).toBeNull();
    } finally { await app.close(); }
  });

  it('keeps its place when orders are created while a client pages', async () => {
    const app = await start();
    try {
      for (let i = 0; i < 5; i++) await app.create('c' + i, 100);
      const first = await app.call('GET', '/orders?limit=2');
      expect(first.json.data.map((o) => o.id)).toEqual(['ord_5', 'ord_4']);
      await app.create('late', 100);          // newest: sorts before the cursor
      const second = await app.call('GET', '/orders?limit=2&cursor=' + first.json.nextCursor);
      expect(second.json.data.map((o) => o.id)).toEqual(['ord_3', 'ord_2']);
    } finally { await app.close(); }
  });

  it('rejects bad parameters with INVALID_QUERY keyed by raw key', async () => {
    const app = await start();
    try {
      const r = await app.call('GET', '/orders?status=shipped&totalCents[gte]=12abc&sort=customer&limit=0&bogus=1');
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('INVALID_QUERY');
      expect(Object.keys(r.json.error.details).sort()).toEqual(['bogus', 'limit', 'sort', 'status', 'totalCents[gte]']);
      const more = [
        ['status=paid&status=pending', 'status'],
        ['status[in]=paid,,pending', 'status[in]'],
        ['sort=totalCents,-totalCents', 'sort'],
        ['limit=101', 'limit'],
        ['limit=2.5', 'limit'],
        ['totalCents[gt]=5', 'totalCents[gt]'],
      ];
      for (const [q, key] of more) {
        const bad = await app.call('GET', '/orders?' + q);
        expect(bad.status).toBe(400);
        expect(Object.keys(bad.json.error.details)).toEqual([key]);
      }
    } finally { await app.close(); }
  });

  it('rejects a garbage cursor and a cursor from another sort', async () => {
    const app = await start();
    try {
      for (let i = 0; i < 3; i++) await app.create('c', 100 * (i + 1));
      const first = await app.call('GET', '/orders?limit=1&sort=totalCents');
      for (const q of ['cursor=not-a-cursor', 'cursor=' + Buffer.from('null').toString('base64url'), 'sort=-totalCents&cursor=' + first.json.nextCursor]) {
        const r = await app.call('GET', '/orders?limit=1&' + q);
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('INVALID_CURSOR');
      }
    } finally { await app.close(); }
  });
});

describe('PATCH /orders/:id', () => {
  it('merges the patch, bumps the etag, and requires the current one', async () => {
    const app = await start();
    try {
      const o = await app.create('acme', 900);
      const r = await app.patch(o.id, { status: 'paid' }, { 'if-match': '"1"' });
      expect(r.status).toBe(200);
      expect(r.json.data).toStrictEqual({ ...o, status: 'paid' });
      expect(r.headers.get('etag')).toBe('"2"');

      const stale = await app.patch(o.id, { customer: 'other' }, { 'if-match': '"1"' });
      expect(stale.status).toBe(412);
      expect(stale.json.error.code).toBe('PRECONDITION_FAILED');
      expect(stale.headers.get('etag')).toBe('"2"');

      const missing = await app.patch(o.id, { customer: 'other' });
      expect(missing.status).toBe(428);
      expect(missing.json.error.code).toBe('PRECONDITION_REQUIRED');

      expect((await app.patch(o.id, { customer: 'b' }, { 'if-match': 'W/"2"' })).status).toBe(412);
      expect((await app.patch(o.id, { customer: 'b' }, { 'if-match': '"7", "2"' })).status).toBe(200);
      expect((await app.patch(o.id, { customer: 'c' }, { 'if-match': '*' })).status).toBe(200);
      const now = await app.call('GET', '/orders/' + o.id);
      expect(now.json.data.customer).toBe('c');
      expect(now.headers.get('etag')).toBe('"4"');
    } finally { await app.close(); }
  });

  it('checks media type, body and existence before preconditions', async () => {
    const app = await start();
    try {
      const o = await app.create('acme', 900);
      const json = await app.call('PATCH', '/orders/' + o.id, { headers: { 'if-match': '"1"' }, body: { status: 'paid' } });
      expect(json.status).toBe(415);
      expect(json.json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect((await app.patch(o.id, '{"status":', { 'if-match': '"1"' })).json.error.code).toBe('INVALID_JSON');
      expect((await app.patch(o.id, '["x"]', { 'if-match': '"1"' })).json.error.code).toBe('INVALID_PATCH');
      const gone = await app.patch('ord_404', { status: 'paid' });
      expect(gone.status).toBe(404);
      const ok = await app.call('PATCH', '/orders/' + o.id, {
        headers: { 'content-type': 'Application/Merge-Patch+JSON; charset=utf-8', 'if-match': '"1"' }, body: { status: 'paid' },
      });
      expect(ok.status).toBe(200);
    } finally { await app.close(); }
  });

  it('refuses readonly fields and invalid results without changing the order', async () => {
    const app = await start();
    try {
      const o = await app.create('acme', 900);
      const ro = await app.patch(o.id, { customer: 'x', totalCents: 1, id: 'ord_9' }, { 'if-match': '"1"' });
      expect(ro.status).toBe(422);
      expect(ro.json.error.code).toBe('READONLY_FIELD');
      expect(ro.json.error.details).toStrictEqual({ fields: ['totalCents', 'id'] });
      for (const [body, key] of [[{ status: 'shipped' }, 'status'], [{ customer: null }, 'customer'], [{ status: null }, 'status'], [{ note: 'hi' }, 'note']]) {
        const r = await app.patch(o.id, body, { 'if-match': '"1"' });
        expect(r.status).toBe(422);
        expect(r.json.error.code).toBe('VALIDATION_FAILED');
        expect(Object.keys(r.json.error.details)).toEqual([key]);
      }
      const now = await app.call('GET', '/orders/' + o.id);
      expect(now.json.data).toStrictEqual(o);
      expect(now.headers.get('etag')).toBe('"1"');
    } finally { await app.close(); }
  });

  it('does not let a slow upload overwrite a newer version', async () => {
    const app = await start();
    try {
      const o = await app.create('acme', 900);
      const bodyA = JSON.stringify({ customer: 'from-A' });
      let resolveA;
      const doneA = new Promise((r) => { resolveA = r; });
      const reqA = http.request({
        host: '127.0.0.1', port: app.port, method: 'PATCH', path: '/orders/' + o.id,
        headers: { 'content-type': 'application/merge-patch+json', 'if-match': '"1"', 'content-length': Buffer.byteLength(bodyA) },
      }, (res) => { res.resume(); res.on('end', () => resolveA(res.statusCode)); });
      reqA.on('error', () => resolveA(0));
      reqA.write(bodyA.slice(0, 4));
      await new Promise((r) => setTimeout(r, 50));
      const b = await app.patch(o.id, { customer: 'from-B' }, { 'if-match': '"1"' });
      expect(b.status).toBe(200);
      reqA.end(bodyA.slice(4));
      expect(await doneA).toBe(412);
      expect((await app.call('GET', '/orders/' + o.id)).json.data.customer).toBe('from-B');
    } finally { await app.close(); }
  });

  it('shows patched values in the list, and never leaks internal fields', async () => {
    const app = await start();
    try {
      const o = await app.create('acme', 900);
      await app.patch(o.id, { status: 'paid' }, { 'if-match': '"1"' });
      const list = await app.call('GET', '/orders?status=paid');
      expect(list.json.data).toStrictEqual([{ ...o, status: 'paid' }]);
    } finally { await app.close(); }
  });
});
