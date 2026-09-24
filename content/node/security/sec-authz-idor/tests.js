import http from 'node:http';

const alice = { id: 'u1', role: 'user' };
const bob = { id: 'u2', role: 'user' };
const admin = { id: 'a1', role: 'admin' };

const build = async () => {
  const notes = solution.createNoteRepo();
  const service = solution.createNoteService({ notes });
  const a1 = await service.create(alice, { title: 'alice one', body: 'secret a1' });
  const b1 = await service.create(bob, { title: 'bob one', body: 'secret b1' });
  const a2 = await service.create(alice, { title: 'alice two', body: 'secret a2' });
  return { notes, service, a1, b1, a2 };
};

const caught = async (fn) => {
  try { await fn(); } catch (e) { return e; }
  return null;
};

describe('the service: reading', () => {
  it('lets the owner read their note', async () => {
    const { service, a1 } = await build();
    expect(await service.get(alice, a1.id)).toEqual({ id: a1.id, ownerId: 'u1', title: 'alice one', body: 'secret a1' });
  });

  it('hides a foreign note behind NotFoundError', async () => {
    const { service, b1 } = await build();
    const e = await caught(() => service.get(alice, b1.id));
    expect(e).toBeInstanceOf(solution.NotFoundError);
    expect(e.message).toBe('note not found');
  });

  it('makes a foreign note indistinguishable from a missing one', async () => {
    const { service, b1 } = await build();
    const foreign = await caught(() => service.get(alice, b1.id));
    const missing = await caught(() => service.get(alice, '999'));
    expect(missing).toBeInstanceOf(solution.NotFoundError);
    expect(foreign).toBeInstanceOf(solution.NotFoundError);
    expect(foreign.name).toBe(missing.name);
    expect(foreign.message).toBe(missing.message);
  });

  it('scopes list to the actor, in id order', async () => {
    const { service, a1, a2 } = await build();
    const mine = await service.list(alice);
    expect(mine.map((n) => n.id)).toEqual([a1.id, a2.id]);
    expect(mine.every((n) => n.ownerId === 'u1')).toBe(true);
    expect((await service.list(bob)).map((n) => n.title)).toEqual(['bob one']);
    expect(await service.list({ id: 'u9', role: 'user' })).toEqual([]);
  });

  it('lets an admin read and list everything', async () => {
    const { service, a1, b1, a2 } = await build();
    expect((await service.get(admin, b1.id)).title).toBe('bob one');
    expect((await service.list(admin)).map((n) => n.id)).toEqual([a1.id, b1.id, a2.id]);
  });

  it('does not treat a role-less or unknown role as admin', async () => {
    const { service, b1 } = await build();
    for (const actor of [{ id: 'u1' }, { id: 'u1', role: 'Admin' }, { id: 'u1', role: 'superuser' }]) {
      expect(await caught(() => service.get(actor, b1.id))).toBeInstanceOf(solution.NotFoundError);
    }
  });
});

describe('the service: writing', () => {
  it('always owns a new note as the actor, whatever the input says', async () => {
    const { service } = await build();
    const planted = await service.create(alice, { title: 't', body: 'b', ownerId: 'u2', id: '1' });
    expect(planted.ownerId).toBe('u1');
    expect(planted.id).not.toBe('1');
    expect((await service.list(bob)).map((n) => n.title)).toEqual(['bob one']);
  });

  it('stores only title and body from the input', async () => {
    const { service } = await build();
    const note = await service.create(alice, { title: 't', body: 'b', role: 'admin', pinned: true });
    expect(note).toEqual({ id: note.id, ownerId: 'u1', title: 't', body: 'b' });
  });

  it('lets the owner update title and body', async () => {
    const { service, a1 } = await build();
    const updated = await service.update(alice, a1.id, { title: 'renamed' });
    expect(updated).toEqual({ id: a1.id, ownerId: 'u1', title: 'renamed', body: 'secret a1' });
  });

  it('refuses to move a note to another owner through update', async () => {
    const { service, a1 } = await build();
    await service.update(alice, a1.id, { ownerId: 'u2', id: '77', title: 'x' });
    const after = await service.get(alice, a1.id);
    expect(after.ownerId).toBe('u1');
    expect(after.id).toBe(a1.id);
    expect(after.title).toBe('x');
    expect(await caught(() => service.get(bob, a1.id))).toBeInstanceOf(solution.NotFoundError);
  });

  it('rejects a foreign update and leaves the note untouched', async () => {
    const { service, notes, b1 } = await build();
    const e = await caught(() => service.update(alice, b1.id, { title: 'pwned' }));
    expect(e).toBeInstanceOf(solution.NotFoundError);
    expect(e.message).toBe('note not found');
    expect((await notes.findById(b1.id)).title).toBe('bob one');
  });

  it('rejects a foreign remove and leaves the note in place', async () => {
    const { service, notes, b1 } = await build();
    expect(await caught(() => service.remove(alice, b1.id))).toBeInstanceOf(solution.NotFoundError);
    expect(await notes.findById(b1.id)).not.toBeNull();
  });

  it('lets the owner remove their note', async () => {
    const { service, notes, a1 } = await build();
    await service.remove(alice, a1.id);
    expect(await notes.findById(a1.id)).toBeNull();
    expect(await caught(() => service.remove(alice, a1.id))).toBeInstanceOf(solution.NotFoundError);
  });

  it('lets an admin update and remove any note', async () => {
    const { service, notes, b1 } = await build();
    expect((await service.update(admin, b1.id, { body: 'moderated' })).ownerId).toBe('u2');
    await service.remove(admin, b1.id);
    expect(await notes.findById(b1.id)).toBeNull();
  });
});

describe('the handler', () => {
  const start = async () => {
    const { service, a1, b1 } = await build();
    const actors = { alice, bob, admin };
    const authenticate = (req) => actors[req.headers['x-test-user']] ?? null;
    const server = http.createServer(solution.createNotesHandler(service, authenticate));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const call = (as, method, path, body) => fetch(base + path, {
      method,
      headers: { ...(as ? { 'x-test-user': as } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { call, a1, b1, close: () => new Promise((r) => server.close(r)) };
  };

  it('401s without an actor', async () => {
    const app = await start();
    try {
      const res = await app.call(null, 'GET', '/notes');
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    } finally { await app.close(); }
  });

  it('serves the owner', async () => {
    const app = await start();
    try {
      const res = await app.call('alice', 'GET', '/notes/' + app.a1.id);
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe('alice one');
    } finally { await app.close(); }
  });

  it('answers a foreign id exactly like a missing one: 404', async () => {
    const app = await start();
    try {
      const foreign = await app.call('alice', 'GET', '/notes/' + app.b1.id);
      const missing = await app.call('alice', 'GET', '/notes/999');
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      const fb = await foreign.text();
      expect(fb).toBe(await missing.text());
      expect(JSON.parse(fb)).toEqual({ error: 'not found' });
      expect(fb).not.toContain('secret');
    } finally { await app.close(); }
  });

  it('404s a foreign PATCH and DELETE', async () => {
    const app = await start();
    try {
      expect((await app.call('alice', 'PATCH', '/notes/' + app.b1.id, { title: 'x' })).status).toBe(404);
      expect((await app.call('alice', 'DELETE', '/notes/' + app.b1.id)).status).toBe(404);
      const still = await app.call('bob', 'GET', '/notes/' + app.b1.id);
      expect(still.status).toBe(200);
      expect((await still.json()).title).toBe('bob one');
    } finally { await app.close(); }
  });

  it('ignores ownerId in a POST body', async () => {
    const app = await start();
    try {
      const res = await app.call('alice', 'POST', '/notes', { title: 'mine', body: 'b', ownerId: 'u2' });
      expect(res.status).toBe(201);
      expect((await res.json()).ownerId).toBe('u1');
      const bobs = await (await app.call('bob', 'GET', '/notes')).json();
      expect(bobs.map((n) => n.title)).toEqual(['bob one']);
    } finally { await app.close(); }
  });

  it('204s an owner DELETE with no body', async () => {
    const app = await start();
    try {
      const res = await app.call('alice', 'DELETE', '/notes/' + app.a1.id);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect((await app.call('alice', 'GET', '/notes/' + app.a1.id)).status).toBe(404);
    } finally { await app.close(); }
  });
});
