const USERS = {
  'tok-alice': { id: 'alice', role: 'customer' },
  'tok-bob': { id: 'bob', role: 'customer' },
  'tok-admin': { id: 'root', role: 'admin' },
};

/**
 * Starts a fresh app on a free port and always closes it.
 *   await withApp(async (as) => {
 *     const { status, headers, body } = await as('alice', 'POST', '/orders', { json: { items } });
 *   });
 * `as(user, method, path, { json, headers })`: user is 'alice', 'bob', 'admin' or null (no token).
 */
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

describe('orders', () => {
  it('alice can create and read her order', async () => {
    await withApp(async (as) => {
      const created = await as('alice', 'POST', '/orders', { json: { items: ITEMS } });
      expect(created.status).toBe(201);
      const read = await as('alice', 'GET', `/orders/${created.body.id}`);
      expect(read.status).toBe(200);
    });
  });

  // TODO: bob and the admin, the list, 401, If-Match (missing, stale, the two-writer race),
  // cancelled orders, and who may DELETE.
});
