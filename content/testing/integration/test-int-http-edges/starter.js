/**
 * Starts a fresh app on a free port, hands you `call`, and always closes the server.
 *   call(method, path, { json })            sends JSON with content-type application/json
 *   call(method, path, { body, headers })   sends `body` exactly as given, with your headers
 */
async function withApp(fn) {
  const server = solution.createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, { json, body, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (json !== undefined) {
      init.body = JSON.stringify(json);
      init.headers['content-type'] ??= 'application/json';
    } else if (body !== undefined) {
      init.body = body;
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  try {
    return await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('bookmarks API', () => {
  it('creates a bookmark', async () => {
    await withApp(async (call) => {
      const { status } = await call('POST', '/bookmarks', { json: { url: 'https://example.com' } });
      expect(status).toBe(201);
    });
  });

  // TODO: Location, 405 + Allow, 415 (and the charset variant), 413, 400 INVALID_JSON.
});
