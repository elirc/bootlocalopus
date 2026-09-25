const { fetchJson, HttpError, NetworkError, ContentTypeError } = solution;

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' };
const respond = (status, body, headers = {}) => new Response(body, { status, headers });
/** A fake fetch that records what it was called with. */
const fakeFetch = (makeResponse) => {
  const calls = [];
  const impl = async (url, init) => { calls.push({ url, init }); return makeResponse(); };
  impl.calls = calls;
  return impl;
};
const caught = async (promise) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected fetchJson to reject, but it resolved');
};

describe('success', () => {
  it('parses a JSON body', async () => {
    const f = fakeFetch(() => respond(200, '{"id":7,"name":"Ada"}', JSON_TYPE));
    expect(await fetchJson(f, '/api/users/7')).toEqual({ id: 7, name: 'Ada' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('/api/users/7');
  });

  it('treats JSON content types case-insensitively and accepts +json', async () => {
    expect(await fetchJson(fakeFetch(() => respond(200, '[1]', { 'content-type': 'Application/JSON' })), '/a')).toEqual([1]);
    expect(await fetchJson(fakeFetch(() => respond(200, '{"x":1}', { 'content-type': 'application/vnd.api+json' })), '/b')).toEqual({ x: 1 });
  });

  it('resolves null for 204 and for an empty 200', async () => {
    expect(await fetchJson(fakeFetch(() => respond(204, null)), '/a')).toBe(null);
    expect(await fetchJson(fakeFetch(() => respond(200, '', JSON_TYPE)), '/b')).toBe(null);
    expect(await fetchJson(fakeFetch(() => respond(200, '')), '/c')).toBe(null);
  });

  it('returns falsy JSON values as they are', async () => {
    expect(await fetchJson(fakeFetch(() => respond(200, 'false', JSON_TYPE)), '/a')).toBe(false);
    expect(await fetchJson(fakeFetch(() => respond(200, '0', JSON_TYPE)), '/a')).toBe(0);
  });
});

describe('a 200 that is not JSON', () => {
  it('throws ContentTypeError for the SPA fallback page', async () => {
    const f = fakeFetch(() => respond(200, '<!doctype html><div id="root"></div>', { 'content-type': 'text/html' }));
    const error = await caught(fetchJson(f, '/api/usres'));
    expect(error).toBeInstanceOf(ContentTypeError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ContentTypeError');
    expect(error.message).toBe('Expected JSON from /api/usres');
    expect(error.status).toBe(200);
    expect(error.contentType).toBe('text/html');
  });

  it('reports a missing content type as null', async () => {
    const error = await caught(fetchJson(fakeFetch(() => new Response(new Uint8Array([123, 125]))), '/x'));
    expect(error).toBeInstanceOf(ContentTypeError);
    expect(error.contentType).toBe(null);
  });

  it('does not accept a type that merely contains "json"', async () => {
    const error = await caught(fetchJson(fakeFetch(() => respond(200, '{}', { 'content-type': 'text/jsonish' })), '/x'));
    expect(error).toBeInstanceOf(ContentTypeError);
  });

  it('lets a SyntaxError through when a JSON-typed body does not parse', async () => {
    const error = await caught(fetchJson(fakeFetch(() => respond(200, '{"broken"', JSON_TYPE)), '/x'));
    expect(error).toBeInstanceOf(SyntaxError);
  });
});

describe('HTTP errors resolve, so you must throw', () => {
  it('turns a 404 with a JSON body into HttpError with the parsed body', async () => {
    const f = fakeFetch(() => respond(404, '{"error":"not found"}', JSON_TYPE));
    const error = await caught(fetchJson(f, '/api/users/9'));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.name).toBe('HttpError');
    expect(error.message).toBe('HTTP 404 for /api/users/9');
    expect(error.status).toBe(404);
    expect(error.url).toBe('/api/users/9');
    expect(error.body).toEqual({ error: 'not found' });
  });

  it('parses application/problem+json error bodies', async () => {
    const problem = { type: 'about:blank', title: 'Invalid', status: 422, errors: { email: 'required' } };
    const error = await caught(fetchJson(fakeFetch(() => respond(422, JSON.stringify(problem), { 'content-type': 'application/problem+json' })), '/f'));
    expect(error.status).toBe(422);
    expect(error.body).toEqual(problem);
  });

  it('keeps an HTML error page as text (and reads the body only once)', async () => {
    const page = '<html><h1>502 Bad Gateway</h1></html>';
    const error = await caught(fetchJson(fakeFetch(() => respond(502, page, { 'content-type': 'text/html' })), '/x'));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(502);
    expect(error.body).toBe(page);
  });

  it('keeps the text when an error body claims JSON but is not', async () => {
    const error = await caught(fetchJson(fakeFetch(() => respond(500, 'Internal Server Error', JSON_TYPE)), '/x'));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.body).toBe('Internal Server Error');
  });

  it('uses null for an empty error body', async () => {
    const error = await caught(fetchJson(fakeFetch(() => respond(401, '')), '/x'));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
    expect(error.body).toBe(null);
  });
});

describe('rejections', () => {
  it('wraps a network failure in NetworkError with the cause', async () => {
    const original = new TypeError('fetch failed');
    const error = await caught(fetchJson(async () => { throw original; }, '/api/x'));
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.name).toBe('NetworkError');
    expect(error.message).toBe('Network error for /api/x');
    expect(error.url).toBe('/api/x');
    expect(error.cause).toBe(original);
  });

  it('rethrows an AbortError untouched', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    const error = await caught(fetchJson(async () => { throw abort; }, '/x'));
    expect(error).toBe(abort);
  });
});

describe('the request', () => {
  const headersOf = (f) => new Headers(f.calls[0].init.headers);

  it('adds accept: application/json when absent', async () => {
    const f = fakeFetch(() => respond(200, '{}', JSON_TYPE));
    await fetchJson(f, '/x');
    expect(headersOf(f).get('accept')).toBe('application/json');
  });

  it('keeps the caller\'s Accept and other headers, in any header shape', async () => {
    const shapes = [
      { Accept: 'application/vnd.api+json', 'X-Trace': 't1' },
      [['accept', 'application/vnd.api+json'], ['x-trace', 't1']],
      new Headers({ ACCEPT: 'application/vnd.api+json', 'x-trace': 't1' }),
    ];
    for (const headers of shapes) {
      const f = fakeFetch(() => respond(200, '{}', JSON_TYPE));
      await fetchJson(f, '/x', { headers });
      expect(headersOf(f).get('accept')).toBe('application/vnd.api+json');
      expect(headersOf(f).get('x-trace')).toBe('t1');
    }
  });

  it('passes method, body and signal through', async () => {
    const f = fakeFetch(() => respond(201, '{"id":1}', JSON_TYPE));
    const signal = new AbortController().signal;
    const out = await fetchJson(f, '/items', { method: 'POST', body: '{"a":1}', signal, headers: { 'content-type': 'application/json' } });
    expect(out).toEqual({ id: 1 });
    const init = f.calls[0].init;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.signal).toBe(signal);
    expect(headersOf(f).get('content-type')).toBe('application/json');
  });
});
