const { createClient } = solution;

function fakeFetch(respond) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch, calls };
}

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

const asUser = (data) => {
  if (typeof data !== 'object' || data === null || typeof data.id !== 'string') {
    throw new TypeError('expected a user');
  }
  return { id: data.id };
};
const anything = (data) => data;

describe('requests', () => {
  it('GETs the joined URL with an accept header', async () => {
    const { fetch, calls } = fakeFetch(() => json({ id: 'u1' }));
    const api = createClient({ baseUrl: 'https://api.test/v1', fetch });
    await api.get('/users/u1', asUser);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test/v1/users/u1');
    expect(calls[0].init.method).toBe('GET');
    expect(new Headers(calls[0].init.headers).get('accept')).toBe('application/json');
  });

  it('joins with exactly one slash however base and path are written', async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    await createClient({ baseUrl: 'https://api.test/v1/', fetch }).get('/a', anything);
    await createClient({ baseUrl: 'https://api.test/v1/', fetch }).get('b', anything);
    await createClient({ baseUrl: 'https://api.test/v1', fetch }).get('c', anything);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.test/v1/a',
      'https://api.test/v1/b',
      'https://api.test/v1/c',
    ]);
  });

  it('sends the configured headers on every request', async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createClient({ baseUrl: 'https://api.test', fetch, headers: { authorization: 'Bearer t0k' } });
    await api.get('/me', anything);
    await api.post('/things', { a: 1 }, anything);
    for (const call of calls) {
      expect(new Headers(call.init.headers).get('authorization')).toBe('Bearer t0k');
    }
  });

  it('POSTs a JSON body with a content-type', async () => {
    const { fetch, calls } = fakeFetch(() => json({ id: 'u2' }, 201));
    const api = createClient({ baseUrl: 'https://api.test', fetch });
    const result = await api.post('/users', { name: 'Ada' }, asUser);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toEqual({ name: 'Ada' });
    expect(new Headers(calls[0].init.headers).get('content-type')).toBe('application/json');
    expect(result).toEqual({ ok: true, value: { id: 'u2' } });
  });
});

describe('success', () => {
  it('returns the parsed value', async () => {
    const { fetch } = fakeFetch(() => json({ id: 'u1', extra: true }));
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).get('/users/u1', asUser);
    expect(result).toEqual({ ok: true, value: { id: 'u1' } });
  });

  it('treats an empty 204 body as undefined, not as a parse error', async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    let seen = 'not called';
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).post('/logout', {}, (data) => {
      seen = data;
      return 'done';
    });
    expect(seen).toBeUndefined();
    expect(result).toEqual({ ok: true, value: 'done' });
  });
});

describe('failures are values, never rejections', () => {
  it('a rejected fetch is a network error carrying the cause', async () => {
    const offline = new TypeError('fetch failed');
    const api = createClient({ baseUrl: 'https://api.test', fetch: async () => { throw offline; } });
    const result = await api.get('/users', anything);
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('network');
    expect(result.error.cause).toBe(offline);
  });

  it('a non-2xx status is an http error with the raw body text', async () => {
    const { fetch } = fakeFetch(() => new Response('upstream exploded', { status: 502 }));
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).get('/users', anything);
    expect(result).toEqual({ ok: false, error: { kind: 'http', status: 502, body: 'upstream exploded' } });
  });

  it('a JSON error body is still reported as text', async () => {
    const { fetch } = fakeFetch(() => json({ error: 'not found' }, 404));
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).get('/users/x', asUser);
    expect(result).toEqual({ ok: false, error: { kind: 'http', status: 404, body: '{"error":"not found"}' } });
  });

  it('invalid JSON on a 2xx is a parse error', async () => {
    const { fetch } = fakeFetch(() => new Response('<html>login</html>', { status: 200 }));
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).get('/users', anything);
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('parse');
    expect(typeof result.error.message).toBe('string');
    expect(result.error.message.length).toBeGreaterThan(0);
  });

  it('a parser that rejects the data is a parse error with its message', async () => {
    const { fetch } = fakeFetch(() => json({ id: 42 }));
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).get('/users/1', asUser);
    expect(result).toEqual({ ok: false, error: { kind: 'parse', message: 'expected a user' } });
  });

  it('a parser that throws a non-Error still produces a string message', async () => {
    const { fetch } = fakeFetch(() => json({}));
    const result = await createClient({ baseUrl: 'https://api.test', fetch }).get('/x', () => {
      throw 'bad shape';
    });
    expect(result).toEqual({ ok: false, error: { kind: 'parse', message: 'bad shape' } });
  });

  it('does not call the parser for an http error', async () => {
    const { fetch } = fakeFetch(() => new Response('nope', { status: 500 }));
    let called = false;
    await createClient({ baseUrl: 'https://api.test', fetch }).get('/x', (d) => { called = true; return d; });
    expect(called).toBe(false);
  });
});
