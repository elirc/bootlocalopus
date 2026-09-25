const SEED = [
  { id: 'a1', title: 'Hello', body: 'First post' },
  { id: 'a2', title: 'Second', body: 'Another post' },
];

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

const revalidate = (call, id, tag) => call('GET', `/articles/${id}`, { headers: { 'if-none-match': tag } });
const directives = (headers) => (headers.get('cache-control') ?? '').split(',').map((d) => d.trim().toLowerCase());

describe('a fresh GET', () => {
  it('returns the article, an ETag and Cache-Control: no-cache', async () => {
    await withApp(async (call) => {
      const { status, headers, body } = await call('GET', '/articles/a1');
      expect(status).toBe(200);
      expect(body).toEqual({ id: 'a1', title: 'Hello', body: 'First post', version: 1 });
      expect(headers.get('etag')).toMatch(/^(W\/)?".+"$/);
      expect(directives(headers)).toContain('no-cache');
    });
  });
});

describe('revalidating', () => {
  it('answers 304 with no body to the current ETag, and keeps the cache headers', async () => {
    await withApp(async (call) => {
      const etag = (await call('GET', '/articles/a1')).headers.get('etag');
      const again = await revalidate(call, 'a1', etag);
      expect(again.status).toBe(304);
      expect(again.text).toBe('');
      expect(again.headers.get('etag')).toBe(etag);
      expect(directives(again.headers)).toContain('no-cache');
    });
  });

  it('answers 200 with the article to a tag that does not match', async () => {
    await withApp(async (call) => {
      const res = await revalidate(call, 'a1', '"some-old-version"');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Hello');
    });
  });

  it('matches any tag in a list', async () => {
    await withApp(async (call) => {
      const etag = (await call('GET', '/articles/a1')).headers.get('etag');
      expect((await revalidate(call, 'a1', `"nope", ${etag}`)).status).toBe(304);
      expect((await revalidate(call, 'a1', '"nope", "also-nope"')).status).toBe(200);
    });
  });

  it('compares weakly: W/"x" matches "x"', async () => {
    await withApp(async (call) => {
      const etag = (await call('GET', '/articles/a1')).headers.get('etag');
      const weak = etag.startsWith('W/') ? etag : `W/${etag}`;
      expect((await revalidate(call, 'a1', weak)).status).toBe(304);
    });
  });

  it('treats * as a match', async () => {
    await withApp(async (call) => {
      expect((await revalidate(call, 'a1', '*')).status).toBe(304);
    });
  });
});

describe('after a change', () => {
  it('the old ETag no longer matches, and the new one does', async () => {
    await withApp(async (call) => {
      const oldTag = (await call('GET', '/articles/a1')).headers.get('etag');
      const put = await call('PUT', '/articles/a1', { json: { body: 'First post, typo fixed' } });
      expect(put.status).toBe(200);
      const newTag = put.headers.get('etag');
      expect(newTag).not.toBe(oldTag);

      const stale = await revalidate(call, 'a1', oldTag);
      expect(stale.status).toBe(200);
      expect(stale.body.body).toBe('First post, typo fixed');
      expect((await revalidate(call, 'a1', newTag)).status).toBe(304);
    });
  });
});
