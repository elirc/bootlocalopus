const TOKEN = 'secret-token';
const auth = { authorization: `Bearer ${TOKEN}` };

/**
 * Starts a fresh API on a free port, hands you a `call` helper, and always
 * closes the server afterwards.
 *   await withApi(async (call) => { const { status, body } = await call('GET', '/health'); ... });
 */
async function withApi(fn, options = {}) {
  const { server } = solution.createApi({ token: TOKEN, ...options });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, { body, headers = auth } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('notes API', () => {
  it('health needs no token', async () => {
    await withApi(async (call) => {
      const { status, body } = await call('GET', '/health', { headers: {} });
      expect(status).toBe(200);
      expect(body).toEqual({ status: 'ok' });
    });
  });

  it('creates a note', async () => {
    await withApi(async (call) => {
      const { body } = await call('POST', '/notes', { body: { title: 'Hello' } });
      expect(body.title).toBe('Hello');
    });
  });

  // TODO: statuses, auth on every route, validation, the 500 path, paging, PATCH.
});
