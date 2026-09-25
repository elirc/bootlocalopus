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

/** The methods in an Allow header, as a sorted list: order and spacing are not the contract. */
const allowed = (headers) => (headers.get('allow') ?? '').split(',').map((m) => m.trim()).filter(Boolean).sort();

describe('creating', () => {
  it('answers 201 with the bookmark and a Location that resolves to it', async () => {
    await withApp(async (call) => {
      const created = await call('POST', '/bookmarks', { json: { url: 'https://example.com', note: 'read later' } });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ url: 'https://example.com', note: 'read later' });
      const location = created.headers.get('location');
      expect(location).toBe(`/bookmarks/${created.body.id}`);
      const fetched = await call('GET', location);
      expect(fetched.status).toBe(200);
      expect(fetched.body.url).toBe('https://example.com');
    });
  });

  it('accepts application/json with a charset parameter', async () => {
    await withApp(async (call) => {
      const { status } = await call('POST', '/bookmarks', {
        json: { url: 'https://example.com' },
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
      expect(status).toBe(201);
    });
  });

  it('rejects other media types with 415, even when the body is JSON', async () => {
    await withApp(async (call) => {
      for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
        const { status, body } = await call('POST', '/bookmarks', {
          body: JSON.stringify({ url: 'https://example.com' }),
          headers: { 'content-type': type },
        });
        expect(status).toBe(415);
        expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      }
      expect((await call('GET', '/bookmarks')).body.items).toEqual([]);
    });
  });

  it('rejects a body over the limit with 413, even when it is valid JSON', async () => {
    await withApp(async (call) => {
      const note = 'x'.repeat(solution.MAX_BODY_BYTES + 1);
      const { status, body } = await call('POST', '/bookmarks', { json: { url: 'https://example.com', note } });
      expect(status).toBe(413);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  it('rejects malformed JSON with 400 INVALID_JSON, not 500', async () => {
    await withApp(async (call) => {
      const { status, body } = await call('POST', '/bookmarks', {
        body: '{"url": "https://example.com"',
        headers: { 'content-type': 'application/json' },
      });
      expect(status).toBe(400);
      expect(body.error.code).toBe('INVALID_JSON');
    });
  });

  it('rejects a missing or non-http url with 400 VALIDATION', async () => {
    await withApp(async (call) => {
      for (const json of [{}, { url: 'ftp://example.com' }, { url: 42 }]) {
        const { status, body } = await call('POST', '/bookmarks', { json });
        expect(status).toBe(400);
        expect(body.error.code).toBe('VALIDATION');
      }
    });
  });
});

describe('methods and paths', () => {
  it('answers 405 with Allow on the collection', async () => {
    await withApp(async (call) => {
      const { status, headers, body } = await call('PUT', '/bookmarks');
      expect(status).toBe(405);
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(allowed(headers)).toEqual(['GET', 'POST']);
    });
  });

  it('answers 405 with Allow on an item, whether or not it exists', async () => {
    await withApp(async (call) => {
      await call('POST', '/bookmarks', { json: { url: 'https://example.com' } });
      for (const path of ['/bookmarks/1', '/bookmarks/999']) {
        const { status, headers } = await call('PATCH', path, { json: { note: 'x' } });
        expect(status).toBe(405);
        expect(allowed(headers)).toEqual(['DELETE', 'GET']);
      }
    });
  });

  it('deletes with 204, then 404s', async () => {
    await withApp(async (call) => {
      await call('POST', '/bookmarks', { json: { url: 'https://example.com' } });
      expect((await call('DELETE', '/bookmarks/1')).status).toBe(204);
      expect((await call('GET', '/bookmarks/1')).status).toBe(404);
      expect((await call('DELETE', '/bookmarks/1')).status).toBe(404);
    });
  });

  it('answers 404 NOT_FOUND for an unknown path', async () => {
    await withApp(async (call) => {
      const { status, body } = await call('GET', '/nope');
      expect(status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
