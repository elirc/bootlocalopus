const SEED = [
  { id: 'a1', title: 'Hello', body: 'First post' },
  { id: 'a2', title: 'Second', body: 'Another post' },
];

/** Starts a seeded app on a free port, hands you `call`, and always closes the server. */
async function withApp(fn) {
  const server = solution.createApp({ seed: SEED });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, { json, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: json === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('conditional GET', () => {
  it('returns the article with an ETag', async () => {
    await withApp(async (call) => {
      const { status, headers } = await call('GET', '/articles/a1');
      expect(status).toBe(200);
      expect(headers.get('etag')).toBeTruthy();
    });
  });

  // TODO: 304 on a match (with headers), 200 on a stale tag, lists, W/ tags,
  // and fetch → PUT → revalidate with the old tag.
});
