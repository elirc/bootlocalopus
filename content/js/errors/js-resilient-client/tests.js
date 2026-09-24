const jsonResponse = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (data === undefined ? '' : JSON.stringify(data)),
});
const textResponse = (status, text) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text,
});

describe('happy path', () => {
  it('parses a JSON body', async () => {
    const client = solution.createClient({
      baseUrl: 'https://api.test',
      fetch: async () => jsonResponse(200, { id: 1, name: 'ada' }),
    });
    expect(await client.get('/users/1')).toEqual({ id: 1, name: 'ada' });
  });

  it('builds the URL from baseUrl + path', async () => {
    let seen;
    const client = solution.createClient({
      baseUrl: 'https://api.test',
      fetch: async (url) => { seen = url; return jsonResponse(200, {}); },
    });
    await client.get('/users');
    expect(seen).toBe('https://api.test/users');
  });

  it('resolves null for 204', async () => {
    const client = solution.createClient({ fetch: async () => jsonResponse(204) });
    expect(await client.get('/things')).toBe(null);
  });

  it('posts JSON with the right header and method', async () => {
    let init;
    const client = solution.createClient({
      fetch: async (_url, opts) => { init = opts; return jsonResponse(201, { id: 9 }); },
    });
    const out = await client.post('/users', { name: 'bob' });
    expect(out).toEqual({ id: 9 });
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"bob"}');
    const contentType = init.headers['content-type'] ?? init.headers['Content-Type'];
    expect(contentType).toBe('application/json');
  });

  it('passes an AbortSignal to fetch', async () => {
    let init;
    const client = solution.createClient({
      fetch: async (_url, opts) => { init = opts; return jsonResponse(200, {}); },
    });
    await client.get('/x');
    expect(init.signal).toBeDefined();
    expect(typeof init.signal.aborted).toBe('boolean');
  });
});

describe('errors', () => {
  it('throws HttpError on a 4xx with status and body', async () => {
    const client = solution.createClient({
      fetch: async () => jsonResponse(404, { error: 'no such user' }),
    });
    let caught;
    try { await client.get('/users/99'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.HttpError);
    expect(caught.status).toBe(404);
    expect(caught.body).toEqual({ error: 'no such user' });
    expect(caught.message).toBe('GET /users/99 failed with 404');
  });

  it('keeps a non-JSON error body as text', async () => {
    const client = solution.createClient({
      fetch: async () => textResponse(500, '<html>gateway down</html>'),
      retries: 0,
    });
    let caught;
    try { await client.get('/x'); } catch (e) { caught = e; }
    expect(caught.body).toBe('<html>gateway down</html>');
  });
});

describe('retries', () => {
  it('retries 5xx and succeeds', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      fetch: async () => {
        calls++;
        return calls < 3 ? jsonResponse(503, { error: 'unavailable' }) : jsonResponse(200, { ok: true });
      },
    });
    expect(await client.get('/x')).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('never retries a 4xx', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 5,
      fetch: async () => { calls++; return jsonResponse(400, { error: 'bad input' }); },
    });
    await expect(client.get('/x')).rejects.toThrow('failed with 400');
    expect(calls).toBe(1);
  });

  it('retries network errors', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      fetch: async () => {
        calls++;
        if (calls < 3) throw new TypeError('fetch failed');
        return jsonResponse(200, { recovered: true });
      },
    });
    expect(await client.get('/x')).toEqual({ recovered: true });
    expect(calls).toBe(3);
  });

  it('stops after the retry budget, reporting the last failure', async () => {
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      fetch: async () => { calls++; return jsonResponse(500, { error: 'boom' }); },
    });
    await expect(client.get('/x')).rejects.toThrow('failed with 500');
    expect(calls).toBe(3);
  });

  it('awaits backoff between attempts, with the attempt number', async () => {
    const seen = [];
    let calls = 0;
    const client = solution.createClient({
      retries: 2,
      backoff: async (attempt) => { seen.push(attempt); },
      fetch: async () => { calls++; return jsonResponse(500, {}); },
    });
    await client.get('/x').catch(() => {});
    expect(calls).toBe(3);
    expect(seen).toEqual([1, 2]);
  });
});

describe('timeouts and cancellation', () => {
  it('times out a hanging request and retries it', async () => {
    let calls = 0;
    const client = solution.createClient({
      timeoutMs: 30,
      retries: 1,
      fetch: async (_url, opts) => {
        calls++;
        if (calls === 1) {
          // Hang until the per-attempt signal fires.
          return await new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => reject(new Error('aborted by signal')));
          });
        }
        return jsonResponse(200, { late: false });
      },
    });
    expect(await client.get('/slow')).toEqual({ late: false });
    expect(calls).toBe(2);
  });

  it('a caller abort stops everything with no retry', async () => {
    const controller = new AbortController();
    let calls = 0;
    const client = solution.createClient({
      retries: 5,
      timeoutMs: 500,
      fetch: async (_url, opts) => {
        calls++;
        // Abort after the listener is attached, the way a real user navigation would.
        setTimeout(() => controller.abort(new Error('user left the page')), 5);
        return await new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    });
    await expect(client.get('/x', { signal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('does not call fetch at all if the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already gone'));
    let calls = 0;
    const client = solution.createClient({ fetch: async () => { calls++; return jsonResponse(200, {}); } });
    await expect(client.get('/x', { signal: controller.signal })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});