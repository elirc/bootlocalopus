const USERS = {
  'tok-alice': { id: 'alice', role: 'customer' },
  'tok-bob': { id: 'bob', role: 'customer' },
  'tok-admin': { id: 'root', role: 'admin' },
};

async function withApp(fn) {
  const server = solution.createApp({ users: USERS });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const as = async (user, method, path, { json, headers = {} } = {}) => {
    const h = { ...headers };
    if (user) h.authorization = `Bearer tok-${user}`;
    if (json !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers: h, body: json === undefined ? undefined : JSON.stringify(json) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(as);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const ITEMS = [{ sku: 'mug', qty: 1 }];

/** Creates an order as `user` and returns { id, etag }. */
async function place(as, user, items = ITEMS) {
  const res = await as(user, 'POST', '/orders', { json: { items } });
  expect(res.status).toBe(201);
  return { id: res.body.id, etag: res.headers.get('etag') };
}

describe('authentication and creation', () => {
  it('rejects a missing or unknown token with 401', async () => {
    await withApp(async (as) => {
      expect((await as(null, 'GET', '/orders')).status).toBe(401);
      const res = await as('mallory', 'GET', '/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  it('creates an open order owned by the caller, with an ETag', async () => {
    await withApp(async (as) => {
      const res = await as('alice', 'POST', '/orders', { json: { items: ITEMS } });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ owner: 'alice', status: 'open', items: ITEMS });
      expect(res.headers.get('etag')).toBeTruthy();
    });
  });
});

describe('who can see what', () => {
  it('another customer gets 404 for an order that exists, the same as for a missing one', async () => {
    await withApp(async (as) => {
      const { id } = await place(as, 'alice');
      const foreign = await as('bob', 'GET', `/orders/${id}`);
      const missing = await as('bob', 'GET', '/orders/999');
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe('NOT_FOUND');
      expect(missing.status).toBe(404);
      expect(foreign.body.error.code).toBe(missing.body.error.code);
    });
  });

  it('another customer cannot patch, cancel or delete it either (404)', async () => {
    await withApp(async (as) => {
      const { id, etag } = await place(as, 'alice');
      expect((await as('bob', 'PATCH', `/orders/${id}`, { json: { items: ITEMS }, headers: { 'if-match': etag } })).status).toBe(404);
      expect((await as('bob', 'POST', `/orders/${id}/cancel`)).status).toBe(404);
      expect((await as('bob', 'DELETE', `/orders/${id}`)).status).toBe(404);
      expect((await as('alice', 'GET', `/orders/${id}`)).body.status).toBe('open');
    });
  });

  it('the list shows a customer only their own orders, and an admin all of them', async () => {
    await withApp(async (as) => {
      const a = await place(as, 'alice');
      const b = await place(as, 'bob');
      const ids = async (user) => (await as(user, 'GET', '/orders')).body.items.map((o) => o.id).sort();
      expect(await ids('alice')).toEqual([a.id]);
      expect(await ids('bob')).toEqual([b.id]);
      expect(await ids('admin')).toEqual([a.id, b.id].sort());
    });
  });

  it('an admin can read any order', async () => {
    await withApp(async (as) => {
      const { id } = await place(as, 'alice');
      const res = await as('admin', 'GET', `/orders/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.owner).toBe('alice');
    });
  });
});

describe('conditional updates', () => {
  it('requires If-Match: 428 without it, and nothing changes', async () => {
    await withApp(async (as) => {
      const { id } = await place(as, 'alice');
      const res = await as('alice', 'PATCH', `/orders/${id}`, { json: { items: [{ sku: 'tea', qty: 2 }] } });
      expect(res.status).toBe(428);
      expect(res.body.error.code).toBe('PRECONDITION_REQUIRED');
      expect((await as('alice', 'GET', `/orders/${id}`)).body.items).toEqual(ITEMS);
    });
  });

  it('applies a PATCH with the current ETag and returns a new one', async () => {
    await withApp(async (as) => {
      const { id, etag } = await place(as, 'alice');
      const res = await as('alice', 'PATCH', `/orders/${id}`, { json: { items: [{ sku: 'tea', qty: 2 }] }, headers: { 'if-match': etag } });
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([{ sku: 'tea', qty: 2 }]);
      expect(res.headers.get('etag')).not.toBe(etag);
    });
  });

  it('two writers with the same ETag: the second gets 412 and the first change survives', async () => {
    await withApp(async (as) => {
      const { id, etag } = await place(as, 'alice');
      const writerA = await as('alice', 'PATCH', `/orders/${id}`, { json: { items: [{ sku: 'tea', qty: 2 }] }, headers: { 'if-match': etag } });
      expect(writerA.status).toBe(200);

      const writerB = await as('admin', 'PATCH', `/orders/${id}`, { json: { items: [{ sku: 'cake', qty: 9 }] }, headers: { 'if-match': etag } });
      expect(writerB.status).toBe(412);
      expect(writerB.body.error.code).toBe('PRECONDITION_FAILED');
      expect((await as('alice', 'GET', `/orders/${id}`)).body.items).toEqual([{ sku: 'tea', qty: 2 }]);
    });
  });

  it('a cancelled order cannot be patched or cancelled again (409)', async () => {
    await withApp(async (as) => {
      const { id } = await place(as, 'alice');
      const cancelled = await as('alice', 'POST', `/orders/${id}/cancel`);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('cancelled');

      const patch = await as('alice', 'PATCH', `/orders/${id}`, {
        json: { items: [{ sku: 'tea', qty: 1 }] },
        headers: { 'if-match': cancelled.headers.get('etag') },
      });
      expect(patch.status).toBe(409);
      expect(patch.body.error.code).toBe('CONFLICT');
      expect((await as('alice', 'POST', `/orders/${id}/cancel`)).status).toBe(409);
      expect((await as('alice', 'GET', `/orders/${id}`)).body.items).toEqual(ITEMS);
    });
  });
});

describe('deleting', () => {
  it('the owner gets 403 and the order stays; an admin deletes it with 204', async () => {
    await withApp(async (as) => {
      const { id } = await place(as, 'alice');
      const byOwner = await as('alice', 'DELETE', `/orders/${id}`);
      expect(byOwner.status).toBe(403);
      expect(byOwner.body.error.code).toBe('FORBIDDEN');
      expect((await as('alice', 'GET', `/orders/${id}`)).status).toBe(200);

      expect((await as('admin', 'DELETE', `/orders/${id}`)).status).toBe(204);
      expect((await as('alice', 'GET', `/orders/${id}`)).status).toBe(404);
    });
  });
});
