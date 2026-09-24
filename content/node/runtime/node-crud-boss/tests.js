const TOKEN = 'secret-token';

const start = async (options) => {
  let clock = new Date('2024-01-01T00:00:00Z');
  const api = solution.createApi({ token: TOKEN, now: () => clock, ...options });
  await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
  const { port } = api.server.address();
  const base = 'http://127.0.0.1:' + port;

  const call = (method, path, { body, auth = true, raw } = {}) =>
    fetch(base + path, {
      method,
      headers: {
        ...(auth ? { authorization: 'Bearer ' + TOKEN } : {}),
        ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  return {
    call,
    get: (p, o) => call('GET', p, o),
    post: (p, body, o) => call('POST', p, { body, ...o }),
    patch: (p, body, o) => call('PATCH', p, { body, ...o }),
    del: (p, o) => call('DELETE', p, o),
    advance: (ms) => { clock = new Date(clock.getTime() + ms); },
    close: () => new Promise((r) => api.server.close(r)),
  };
};

const withApi = async (fn) => {
  const app = await start();
  try { await fn(app); } finally { await app.close(); }
};

describe('health and auth', () => {
  it('serves health with no auth', async () => {
    await withApi(async (app) => {
      const res = await app.get('/health', { auth: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });

  it('401s every other route without a token', async () => {
    await withApi(async (app) => {
      for (const [method, path] of [['GET', '/notes'], ['POST', '/notes'], ['GET', '/notes/1'], ['DELETE', '/notes/1']]) {
        const res = await app.call(method, path, { auth: false });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
          error: { code: 'UNAUTHORIZED', message: 'authentication required' },
        });
      }
    });
  });

  it('401s a wrong or malformed Authorization header', async () => {
    const api = solution.createApi({ token: TOKEN });
    await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
    const { port } = api.server.address();
    try {
      for (const value of ['Bearer', 'Bearer wrong-token', TOKEN, 'Basic ' + TOKEN, 'bearer ' + TOKEN]) {
        const res = await fetch('http://127.0.0.1:' + port + '/notes', {
          headers: { authorization: value },
        });
        expect(res.status).toBe(401);
      }
      // ...and the correct one still works.
      const good = await fetch('http://127.0.0.1:' + port + '/notes', {
        headers: { authorization: 'Bearer ' + TOKEN },
      });
      expect(good.status).toBe(200);
    } finally {
      await new Promise((r) => api.server.close(r));
    }
  });
});

describe('create', () => {
  it('creates a note with defaults and timestamps', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', { title: 'First' });
      expect(res.status).toBe(201);
      const note = await res.json();
      expect(note.id).toBe('1');
      expect(note.title).toBe('First');
      expect(note.body).toBe('');
      expect(note.tags).toEqual([]);
      expect(note.createdAt).toBeTruthy();
      expect(note.updatedAt).toBe(note.createdAt);
    });
  });

  it('trims the title and keeps body and tags', async () => {
    await withApi(async (app) => {
      const note = await (await app.post('/notes', {
        title: '  Spaced  ', body: 'content', tags: ['a', 'b'],
      })).json();
      expect(note.title).toBe('Spaced');
      expect(note.body).toBe('content');
      expect(note.tags).toEqual(['a', 'b']);
    });
  });

  it('assigns sequential ids', async () => {
    await withApi(async (app) => {
      expect((await (await app.post('/notes', { title: 'a' })).json()).id).toBe('1');
      expect((await (await app.post('/notes', { title: 'b' })).json()).id).toBe('2');
      expect((await (await app.post('/notes', { title: 'c' })).json()).id).toBe('3');
    });
  });

  it('400s a missing title', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.details.title).toBeTruthy();
    });
  });

  it('400s a title that is too long or the wrong type', async () => {
    await withApi(async (app) => {
      expect((await app.post('/notes', { title: 'x'.repeat(81) })).status).toBe(400);
      expect((await app.post('/notes', { title: 42 })).status).toBe(400);
      expect((await app.post('/notes', { title: '   ' })).status).toBe(400);
      expect((await app.post('/notes', { title: 'x'.repeat(80) })).status).toBe(201);
    });
  });

  it('400s bad tags', async () => {
    await withApi(async (app) => {
      expect((await app.post('/notes', { title: 'a', tags: 'not-an-array' })).status).toBe(400);
      expect((await app.post('/notes', { title: 'a', tags: [1, 2] })).status).toBe(400);
      expect((await app.post('/notes', { title: 'a', tags: [''] })).status).toBe(400);
    });
  });

  it('400s unknown fields', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', { title: 'a', isAdmin: true });
      expect(res.status).toBe(400);
      expect((await res.json()).error.details.isAdmin).toBeTruthy();
    });
  });

  it('collects every validation failure at once', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', { title: 99, tags: 'nope', surprise: 1 });
      expect(res.status).toBe(400);
      const details = (await res.json()).error.details;
      expect(Object.keys(details).sort()).toEqual(['surprise', 'tags', 'title']);
    });
  });

  it('400s invalid JSON', async () => {
    await withApi(async (app) => {
      const res = await app.call('POST', '/notes', { raw: '{not json' });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('BAD_REQUEST');
    });
  });
});

describe('read', () => {
  it('gets one note', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'Findable' });
      const res = await app.get('/notes/1');
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe('Findable');
    });
  });

  it('404s a missing note with the envelope', async () => {
    await withApi(async (app) => {
      const res = await app.get('/notes/999');
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    });
  });

  it('lists newest first with pagination metadata', async () => {
    await withApi(async (app) => {
      // The clock moves between creates, so createdAt order and id order agree.
      for (const title of ['a', 'b', 'c']) { await app.post('/notes', { title }); app.advance(1000); }
      const body = await (await app.get('/notes')).json();
      expect(body.total).toBe(3);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
      expect(body.items.map((n) => n.title)).toEqual(['c', 'b', 'a']);
    });
  });

  it('pages, and reports the total before paging', async () => {
    await withApi(async (app) => {
      for (let i = 1; i <= 7; i++) { await app.post('/notes', { title: 'n' + i }); app.advance(1000); }
      const page1 = await (await app.get('/notes?limit=3')).json();
      expect(page1.items).toHaveLength(3);
      expect(page1.total).toBe(7);
      expect(page1.items[0].title).toBe('n7');

      const page3 = await (await app.get('/notes?limit=3&offset=6')).json();
      expect(page3.items).toHaveLength(1);
      expect(page3.total).toBe(7);
      expect(page3.items[0].title).toBe('n1');
    });
  });

  it('filters by tag', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'tagged', tags: ['work', 'urgent'] });
      await app.post('/notes', { title: 'other', tags: ['home'] });
      const body = await (await app.get('/notes?tag=work')).json();
      expect(body.total).toBe(1);
      expect(body.items[0].title).toBe('tagged');
      expect((await (await app.get('/notes?tag=nothing')).json()).total).toBe(0);
    });
  });

  it('400s bad pagination', async () => {
    await withApi(async (app) => {
      expect((await app.get('/notes?limit=0')).status).toBe(400);
      expect((await app.get('/notes?limit=51')).status).toBe(400);
      expect((await app.get('/notes?limit=abc')).status).toBe(400);
      expect((await app.get('/notes?offset=-1')).status).toBe(400);
    });
  });
});

describe('update', () => {
  it('patches only the given fields and bumps updatedAt', async () => {
    await withApi(async (app) => {
      const created = await (await app.post('/notes', { title: 'Old', body: 'keep', tags: ['x'] })).json();
      app.advance(60_000);

      const res = await app.patch('/notes/1', { title: 'New' });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.title).toBe('New');
      expect(updated.body).toBe('keep');
      expect(updated.tags).toEqual(['x']);
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });
  });

  it('400s an empty patch', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'a' });
      expect((await app.patch('/notes/1', {})).status).toBe(400);
    });
  });

  it('validates patched fields the same way', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'a' });
      expect((await app.patch('/notes/1', { title: '' })).status).toBe(400);
      expect((await app.patch('/notes/1', { title: 'x'.repeat(81) })).status).toBe(400);
      expect((await app.patch('/notes/1', { tags: 'nope' })).status).toBe(400);
      expect((await app.patch('/notes/1', { nope: 1 })).status).toBe(400);
    });
  });

  it('404s patching a missing note', async () => {
    await withApi(async (app) => {
      expect((await app.patch('/notes/99', { title: 'x' })).status).toBe(404);
    });
  });
});

describe('delete', () => {
  it('204s with no body, and the note is gone', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'temp' });
      const res = await app.del('/notes/1');
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect((await app.get('/notes/1')).status).toBe(404);
    });
  });

  it('404s deleting twice', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'temp' });
      expect((await app.del('/notes/1')).status).toBe(204);
      expect((await app.del('/notes/1')).status).toBe(404);
    });
  });

  it('removes it from the list and total', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'a' });
      await app.post('/notes', { title: 'b' });
      await app.del('/notes/1');
      const body = await (await app.get('/notes')).json();
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
    });
  });
});

describe('routing edges', () => {
  it('404s unknown paths', async () => {
    await withApi(async (app) => {
      expect((await app.get('/nope')).status).toBe(404);
      expect((await app.get('/notes/1/comments')).status).toBe(404);
    });
  });

  it('survives a burst of bad requests', async () => {
    await withApi(async (app) => {
      await app.call('POST', '/notes', { raw: '{{{' });
      await app.post('/notes', { title: null });
      await app.get('/notes?limit=nope');
      const res = await app.post('/notes', { title: 'still working' });
      expect(res.status).toBe(201);
    });
  });
});