/**
 * Starts the app on a free port with your options, hands you `get`, and always closes the server.
 *   let t = 0;
 *   await withApp({ now: () => t }, async (get) => { const { status, headers } = await get('/search', { key: 'a' }); });
 */
async function withApp(options, fn) {
  const server = solution.createApp(options);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const get = async (path, { key } = {}) => {
    const res = await fetch(base + path, { headers: key === undefined ? {} : { 'x-api-key': key } });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(get);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('rate limiting', () => {
  it('rejects the request after the limit', async () => {
    const t = 0;
    await withApp({ now: () => t, limit: 5 }, async (get) => {
      for (let i = 0; i < 5; i++) await get('/search', { key: 'a' });
      expect((await get('/search', { key: 'a' })).status).toBe(429);
    });
  });

  // TODO: the headers, Retry-After in seconds, the window reset (exactly on it),
  // separate keys, no key, /health.
});
