const TOKEN = 'secret-token';
const auth = { authorization: `Bearer ${TOKEN}` };

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
    return { status: res.status, headers: res.headers, text, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('creating', () => {
  it('POST returns 201 and the note with defaults', async () => {
    await withApi(async (call) => {
      const { status, body } = await call('POST', '/notes', { body: { title: '  Hello  ' } });
      expect(status).toBe(201);
      expect(body).toMatchObject({ id: '1', title: 'Hello', body: '', tags: [] });
      expect((await call('GET', '/notes/1')).body.title).toBe('Hello');
    });
  });

  it('rejects invalid input with 400 and a detail per field', async () => {
    await withApi(async (call) => {
      const { status, body } = await call('POST', '/notes', { body: { title: '', tags: 'x', colour: 'red' } });
      expect(status).toBe(400);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(Object.keys(body.error.details).sort()).toEqual(['colour', 'tags', 'title']);
    });
  });

  it('validates PATCH with 400 as well', async () => {
    await withApi(async (call) => {
      await call('POST', '/notes', { body: { title: 'a' } });
      const { status, body } = await call('PATCH', '/notes/1', { body: { title: 42 } });
      expect(status).toBe(400);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });
});

describe('auth', () => {
  const routes = [
    ['GET', '/notes'],
    ['POST', '/notes'],
    ['GET', '/notes/1'],
    ['PATCH', '/notes/1'],
    ['DELETE', '/notes/1'],
  ];
  it('every route but /health is 401 without a valid token, and changes nothing', async () => {
    await withApi(async (call) => {
      await call('POST', '/notes', { body: { title: 'keep me' } });
      for (const [method, path] of routes) {
        const res = await call(method, path, {
          headers: { authorization: 'Bearer wrong-token' },
          body: method === 'POST' || method === 'PATCH' ? { title: 'x' } : undefined,
        });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
      const { body } = await call('GET', '/notes');
      expect(body.total).toBe(1);
      expect(body.items[0].title).toBe('keep me');
    });
  });
});

describe('unexpected failures', () => {
  it('answers 500 INTERNAL without leaking the internal message', async () => {
    const now = () => { throw new Error('connection to db-primary:5432 refused'); };
    await withApi(async (call) => {
      const { status, body, text } = await call('POST', '/notes', { body: { title: 'x' } });
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL');
      expect(text).not.toContain('db-primary');
    }, { now });
  });
});

describe('listing', () => {
  it('pages, newest first, with total counted before paging', async () => {
    await withApi(async (call) => {
      for (let i = 1; i <= 5; i++) await call('POST', '/notes', { body: { title: `n${i}` } });
      const { status, body } = await call('GET', '/notes?limit=2&offset=1');
      expect(status).toBe(200);
      expect(body.total).toBe(5);
      expect(body.items.map((n) => n.title)).toEqual(['n4', 'n3']);
      expect(body).toMatchObject({ limit: 2, offset: 1 });
    });
  });

  it('filters by tag, and total counts only the matches', async () => {
    await withApi(async (call) => {
      await call('POST', '/notes', { body: { title: 'a', tags: ['work'] } });
      await call('POST', '/notes', { body: { title: 'b', tags: ['home'] } });
      await call('POST', '/notes', { body: { title: 'c', tags: ['work', 'urgent'] } });
      const { body } = await call('GET', '/notes?tag=work');
      expect(body.total).toBe(2);
      expect(body.items.map((n) => n.title)).toEqual(['c', 'a']);
    });
  });
});

describe('updating and deleting', () => {
  it('PATCH changes only the fields sent', async () => {
    await withApi(async (call) => {
      await call('POST', '/notes', { body: { title: 'a', body: 'text', tags: ['work'] } });
      const { status, body } = await call('PATCH', '/notes/1', { body: { title: 'b' } });
      expect(status).toBe(200);
      expect(body).toMatchObject({ id: '1', title: 'b', body: 'text', tags: ['work'] });
    });
  });

  it('DELETE is 204, then the note is gone', async () => {
    await withApi(async (call) => {
      await call('POST', '/notes', { body: { title: 'a' } });
      const del = await call('DELETE', '/notes/1');
      expect(del.status).toBe(204);
      expect(del.text).toBe('');
      expect((await call('GET', '/notes/1')).status).toBe(404);
      expect((await call('DELETE', '/notes/1')).status).toBe(404);
    });
  });
});
