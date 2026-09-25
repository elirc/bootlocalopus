const { fetchJson, describeFailure, ApiError, HttpError } = solution;

const URL_ = 'https://api.example.com/users/7';
const respond = (body, init = {}) => async () => new Response(body, init);
const json = (value, status = 200) => respond(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const identity = (b) => b;

function parseUser(body) {
  if (typeof body !== 'object' || body === null || typeof body.id !== 'number' || typeof body.name !== 'string') {
    throw new Error('expected { id: number, name: string }');
  }
  return { id: body.id, name: body.name };
}

async function failure(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the call to reject');
}

describe('success', () => {
  it('returns what the parser returns', async () => {
    expect(await fetchJson(json({ id: 7, name: 'Ada', extra: true }), URL_, parseUser)).toEqual({ id: 7, name: 'Ada' });
  });
  it('passes the url and init through to fetch', async () => {
    const calls = [];
    const fetchFn = async (url, init) => { calls.push([url, init]); return new Response('{}'); };
    const init = { method: 'POST', body: '{"a":1}' };
    await fetchJson(fetchFn, URL_, identity, init);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(URL_);
    expect(calls[0][1]).toBe(init);
  });
  it('gives the parser undefined for an empty body (204)', async () => {
    const seen = [];
    await fetchJson(respond(null, { status: 204 }), URL_, (b) => { seen.push(b); return 'done'; });
    expect(seen).toEqual([undefined]);
  });
});

describe('network failures', () => {
  it('wraps a rejected fetch in an ApiError of kind network', async () => {
    const cause = new TypeError('fetch failed');
    const e = await failure(fetchJson(async () => { throw cause; }, URL_, identity));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe('network');
    expect(e.method).toBe('GET');
    expect(e.url).toBe(URL_);
    expect(e.message).toBe('Network error calling GET ' + URL_);
    expect(e.cause).toBe(cause);
  });
  it('uses the method from init, uppercased', async () => {
    const e = await failure(fetchJson(async () => { throw new Error('x'); }, URL_, identity, { method: 'delete' }));
    expect(e.method).toBe('DELETE');
    expect(e.message).toBe('Network error calling DELETE ' + URL_);
  });
});

describe('HTTP errors', () => {
  it('turns a non-2xx response into an HttpError, even with a JSON body', async () => {
    const e = await failure(fetchJson(json({ error: 'not found' }, 404), URL_, parseUser));
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe('http');
    expect(e.status).toBe(404);
    expect(e.message).toBe('GET ' + URL_ + ' failed with 404');
    expect(e.body).toBe('{"error":"not found"}');
  });
  it('reports an HTML error page as an HTTP error, not a JSON error', async () => {
    const page = '<html><body>502 Bad Gateway</body></html>';
    const e = await failure(fetchJson(respond(page, { status: 502 }), URL_, parseUser));
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(502);
    expect(e.body).toBe(page);
  });
  it('keeps only the first 200 characters of the body', async () => {
    const e = await failure(fetchJson(respond('x'.repeat(5000), { status: 500 }), URL_, identity));
    expect(e.body).toBe('x'.repeat(200));
  });
  it('knows which statuses are worth retrying', async () => {
    const retryable = {};
    for (const status of [400, 401, 404, 408, 409, 429, 500, 503]) {
      const e = await failure(fetchJson(respond('', { status }), URL_, identity));
      retryable[status] = e.retryable;
    }
    expect(retryable).toEqual({ 400: false, 401: false, 404: false, 408: true, 409: false, 429: true, 500: true, 503: true });
  });
  it('does not call the parser for an error response', async () => {
    let called = false;
    await failure(fetchJson(json({ id: 1, name: 'x' }, 500), URL_, () => { called = true; }));
    expect(called).toBe(false);
  });
});

describe('bad bodies', () => {
  it('reports invalid JSON on a 200 as kind parse, with the SyntaxError as cause', async () => {
    const e = await failure(fetchJson(respond('{"id": 7,', { status: 200 }), URL_, parseUser));
    expect(e).toBeInstanceOf(ApiError);
    expect(e instanceof HttpError).toBe(false);
    expect(e.kind).toBe('parse');
    expect(e.message).toBe('Invalid JSON from GET ' + URL_);
    expect(e.cause).toBeInstanceOf(SyntaxError);
  });
  it('reports a parser failure as kind validation, keeping its message and cause', async () => {
    const e = await failure(fetchJson(json({ id: '7', name: 'Ada' }), URL_, parseUser));
    expect(e.kind).toBe('validation');
    expect(e.message).toBe('Unexpected response shape from GET ' + URL_ + ': expected { id: number, name: string }');
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.cause.message).toBe('expected { id: number, name: string }');
  });
  it('copes with a parser that throws a non-Error', async () => {
    const e = await failure(fetchJson(json({}), URL_, () => { throw 'bad shape'; }));
    expect(e.kind).toBe('validation');
    expect(e.message).toBe('Unexpected response shape from GET ' + URL_ + ': bad shape');
    expect(e.cause).toBe('bad shape');
  });
});

describe('describeFailure', () => {
  it('maps each failure to a message for the user', async () => {
    const msg = async (fetchFn, parse = identity) => describeFailure(await failure(fetchJson(fetchFn, URL_, parse)));
    expect(await msg(async () => { throw new TypeError('fetch failed'); })).toBe('You appear to be offline.');
    expect(await msg(respond('', { status: 401 }))).toBe('Please sign in again.');
    expect(await msg(respond('', { status: 404 }))).toBe('Not found.');
    expect(await msg(respond('', { status: 503 }))).toBe('The service is busy. Try again shortly.');
    expect(await msg(respond('', { status: 429 }))).toBe('The service is busy. Try again shortly.');
    expect(await msg(respond('', { status: 400 }))).toBe('Request failed.');
    expect(await msg(respond('nope'))).toBe('Unexpected response from the server.');
    expect(await msg(json({}), parseUser)).toBe('Unexpected response from the server.');
  });
  it('has a fallback for anything that is not an ApiError', () => {
    expect(describeFailure(new Error('boom'))).toBe('Something went wrong.');
    expect(describeFailure(undefined)).toBe('Something went wrong.');
  });
});
