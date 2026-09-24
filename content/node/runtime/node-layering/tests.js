import http from 'node:http';

const build = () => {
  const users = solution.createMemoryUserRepo();
  const service = solution.createUserService({ users });
  return { users, service };
};

describe('the repository', () => {
  it('assigns incrementing string ids', async () => {
    const users = solution.createMemoryUserRepo();
    const a = await users.insert({ email: 'a@x.com' });
    const b = await users.insert({ email: 'b@x.com' });
    expect(a.id).toBe('1');
    expect(b.id).toBe('2');
  });

  it('finds by id and email, and returns null when missing', async () => {
    const users = solution.createMemoryUserRepo();
    await users.insert({ email: 'a@x.com' });
    expect((await users.findById('1')).email).toBe('a@x.com');
    expect(await users.findById('99')).toBe(null);
    expect((await users.findByEmail('a@x.com')).id).toBe('1');
    expect(await users.findByEmail('nope@x.com')).toBe(null);
  });

  it('updates and lists', async () => {
    const users = solution.createMemoryUserRepo();
    await users.insert({ email: 'a@x.com', active: true });
    const updated = await users.update('1', { active: false });
    expect(updated.active).toBe(false);
    expect(updated.email).toBe('a@x.com');
    expect(await users.update('99', { active: false })).toBe(null);
    expect(await users.all()).toHaveLength(1);
  });
});

describe('the service, with no HTTP and no database', () => {
  it('registers a user', async () => {
    const { service } = build();
    const user = await service.register({ email: 'ada@example.com', name: 'Ada' });
    expect(user.id).toBe('1');
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('Ada');
    expect(user.active).toBe(true);
    expect(user.createdAt).toEqual(new Date('2024-01-01'));
  });

  it('normalises the email', async () => {
    const { service } = build();
    const user = await service.register({ email: '  ADA@Example.COM ', name: ' Ada ' });
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('Ada');
  });

  it('rejects an invalid email', async () => {
    const { service } = build();
    for (const email of ['', 'nope', 'a@', '@b.com', null, undefined, 42]) {
      let caught;
      try { await service.register({ email, name: 'x' }); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(solution.ValidationError);
    }
  });

  it('rejects a missing name', async () => {
    const { service } = build();
    await expect(service.register({ email: 'a@x.com', name: '  ' }))
      .rejects.toThrow(/name/);
  });

  it('rejects a duplicate email, case-insensitively', async () => {
    const { service } = build();
    await service.register({ email: 'ada@example.com', name: 'Ada' });
    let caught;
    try { await service.register({ email: 'ADA@example.com', name: 'Impostor' }); }
    catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.ConflictError);
  });

  it('gets by id, or throws NotFoundError', async () => {
    const { service } = build();
    await service.register({ email: 'a@x.com', name: 'A' });
    expect((await service.getById('1')).name).toBe('A');
    let caught;
    try { await service.getById('404'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.NotFoundError);
  });

  it('deactivates, idempotently', async () => {
    const { service } = build();
    await service.register({ email: 'a@x.com', name: 'A' });
    expect((await service.deactivate('1')).active).toBe(false);
    expect((await service.deactivate('1')).active).toBe(false);
    let caught;
    try { await service.deactivate('99'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.NotFoundError);
  });

  it('lists all or only active', async () => {
    const { service } = build();
    await service.register({ email: 'a@x.com', name: 'A' });
    await service.register({ email: 'b@x.com', name: 'B' });
    await service.deactivate('1');
    expect(await service.list()).toHaveLength(2);
    expect(await service.list({ activeOnly: true })).toHaveLength(1);
    expect((await service.list({ activeOnly: true }))[0].name).toBe('B');
  });

  it('works against a fake repository, proving the dependency is injected', async () => {
    // A stub with no storage at all: the service must not reach past it.
    const calls = [];
    const fake = {
      async insert(data) { calls.push('insert'); return { id: 'stub', ...data }; },
      async findById() { calls.push('findById'); return null; },
      async findByEmail() { calls.push('findByEmail'); return null; },
      async update() { calls.push('update'); return null; },
      async all() { calls.push('all'); return []; },
    };
    const service = solution.createUserService({ users: fake });
    const user = await service.register({ email: 'a@x.com', name: 'A' });
    expect(user.id).toBe('stub');
    expect(calls).toContain('findByEmail');
    expect(calls).toContain('insert');
  });

  it('uses the injected clock', async () => {
    const users = solution.createMemoryUserRepo();
    const service = solution.createUserService({ users, now: () => new Date('1999-12-31') });
    const user = await service.register({ email: 'a@x.com', name: 'A' });
    expect(user.createdAt).toEqual(new Date('1999-12-31'));
  });
});

describe('the handler, mapping errors to statuses', () => {
  const start = async () => {
    const { service } = build();
    const server = http.createServer(solution.createUserHandler(service));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const base = 'http://127.0.0.1:' + port;
    return {
      post: (path, body) => fetch(base + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
      get: (path) => fetch(base + path),
      del: (path) => fetch(base + path, { method: 'DELETE' }),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  it('201s a created user', async () => {
    const app = await start();
    try {
      const res = await app.post('/users', { email: 'ada@example.com', name: 'Ada' });
      expect(res.status).toBe(201);
      expect((await res.json()).email).toBe('ada@example.com');
    } finally { await app.close(); }
  });

  it('400s a validation failure', async () => {
    const app = await start();
    try {
      expect((await app.post('/users', { email: 'nope', name: 'x' })).status).toBe(400);
    } finally { await app.close(); }
  });

  it('409s a duplicate', async () => {
    const app = await start();
    try {
      await app.post('/users', { email: 'a@x.com', name: 'A' });
      expect((await app.post('/users', { email: 'a@x.com', name: 'B' })).status).toBe(409);
    } finally { await app.close(); }
  });

  it('404s a missing user', async () => {
    const app = await start();
    try {
      expect((await app.get('/users/99')).status).toBe(404);
    } finally { await app.close(); }
  });

  it('gets, lists and deactivates', async () => {
    const app = await start();
    try {
      await app.post('/users', { email: 'a@x.com', name: 'A' });
      await app.post('/users', { email: 'b@x.com', name: 'B' });

      expect((await (await app.get('/users/1')).json()).name).toBe('A');
      expect(await (await app.get('/users')).json()).toHaveLength(2);

      const deactivated = await app.del('/users/1');
      expect(deactivated.status).toBe(200);
      expect((await deactivated.json()).active).toBe(false);

      expect(await (await app.get('/users?activeOnly=true')).json()).toHaveLength(1);
    } finally { await app.close(); }
  });

  it('404s an unknown route', async () => {
    const app = await start();
    try {
      expect((await app.get('/nope')).status).toBe(404);
    } finally { await app.close(); }
  });
});