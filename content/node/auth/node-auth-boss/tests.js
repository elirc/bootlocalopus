const MIN = 60_000;
const HOUR = 60 * MIN;

const ACCOUNTS = {
  'alice@example.com': { password: 'alice-password', id: 'u1', roles: ['member'] },
  'bob@example.com': { password: 'bob-password', id: 'u2', roles: ['member'] },
  'root@example.com': { password: 'root-password', id: 'u9', roles: ['member', 'admin'] },
  'odd@example.com': { password: 'odd-password', id: 'u7', roles: ['constructor', '__proto__', 'toString'] },
};

const withApp = async (opts, fn) => {
  const clock = { t: 1_700_000_000_000 };
  const calls = [];
  const disabled = new Set();
  const users = {
    async verify(email, password) {
      calls.push(email);
      await null;
      if (users.explode) throw new Error('database is down');
      const a = ACCOUNTS[email];
      if (!Object.hasOwn(ACCOUNTS, email) || a.password !== password || disabled.has(a.id)) return null;
      return { id: a.id, roles: [...a.roles] };
    },
    async disable(id) {
      await null;
      if (!Object.values(ACCOUNTS).some((a) => a.id === id)) return false;
      disabled.add(id);
      return true;
    },
    explode: false,
  };
  const { server } = solution.createAuthApp({ users, permissions: { admin: ['user:disable'] }, now: () => clock.t, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { body, sid, cookie, raw } = {}) => {
    const headers = {};
    if (cookie !== undefined) headers.cookie = cookie;
    else if (sid !== undefined) headers.cookie = `sid=${sid}`;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) payload = JSON.stringify(body);
    if (payload !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: payload });
    const text = await res.text();
    const setCookie = res.headers.get('set-cookie');
    const m = setCookie && /^sid=([^;]*);/.exec(setCookie);
    return {
      status: res.status,
      type: res.headers.get('content-type'),
      body: text ? JSON.parse(text) : undefined,
      text,
      setCookie,
      sid: m ? m[1] : undefined,
    };
  };
  const login = (email, password) => call('POST', '/login', { body: { email, password } });

  try {
    await fn({ call, login, clock, calls, users });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
};

describe('login', () => {
  it('sets a hardened session cookie and returns the user id', async () => {
    await withApp({}, async ({ login }) => {
      const r = await login('alice@example.com', 'alice-password');
      expect(r.status).toBe(200);
      expect(r.type).toMatch(/application\/json/);
      expect(r.body).toEqual({ userId: 'u1' });
      expect(r.sid).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      expect(r.setCookie).toBe(`sid=${r.sid}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      const again = await login('alice@example.com', 'alice-password');
      expect(again.sid).not.toBe(r.sid);
    });
  });

  it('normalises the email before verifying it', async () => {
    await withApp({}, async ({ login, calls }) => {
      expect((await login('  Alice@Example.COM ', 'alice-password')).status).toBe(200);
      expect(calls).toEqual(['alice@example.com']);
    });
  });

  it('answers unknown users and wrong passwords identically', async () => {
    await withApp({}, async ({ login }) => {
      const wrong = await login('alice@example.com', 'nope');
      const unknown = await login('mallory@example.com', 'nope');
      for (const r of [wrong, unknown]) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ error: 'invalid-credentials' });
        expect(r.setCookie).toBeNull();
      }
    });
  });

  it('rejects bodies that are not a JSON object with string fields', async () => {
    await withApp({}, async ({ call }) => {
      for (const raw of ['not json', '[]', 'null', '"x"', '{"email":"alice@example.com"}', '{"email":1,"password":"x"}', '{"email":"alice@example.com","password":["alice-password"]}']) {
        const r = await call('POST', '/login', { raw });
        expect(r.status).toBe(400);
        expect(r.body).toEqual({ error: 'bad-request' });
      }
    });
  });

  it('refuses a body over 64 KiB with 413', async () => {
    await withApp({}, async ({ call }) => {
      const r = await call('POST', '/login', { raw: JSON.stringify({ email: 'a'.repeat(70_000), password: 'x' }) });
      expect(r.status).toBe(413);
      expect(r.body).toEqual({ error: 'too-large' });
    });
  });

  it('destroys the session the browser arrived with (no session fixation)', async () => {
    await withApp({}, async ({ call, login }) => {
      const planted = (await login('bob@example.com', 'bob-password')).sid;
      const r = await call('POST', '/login', { body: { email: 'alice@example.com', password: 'alice-password' }, sid: planted });
      expect(r.status).toBe(200);
      expect(r.sid).not.toBe(planted);
      expect((await call('GET', '/me', { sid: planted })).status).toBe(401);
      expect((await call('GET', '/me', { sid: r.sid })).body.userId).toBe('u1');
      const r2 = await call('POST', '/login', { body: { email: 'alice@example.com', password: 'alice-password' }, sid: 'attacker-chosen-id' });
      expect(r2.sid).not.toBe('attacker-chosen-id');
      expect((await call('GET', '/me', { sid: 'attacker-chosen-id' })).status).toBe(401);
    });
  });
});

describe('sessions', () => {
  it('/me needs a live session and finds sid among other cookies', async () => {
    await withApp({}, async ({ call, login }) => {
      for (const cookie of [undefined, 'sid=', 'sid=nope', 'theme=dark', 'sid=__proto__', 'sid=constructor']) {
        const r = await call('GET', '/me', { cookie });
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ error: 'unauthorized' });
      }
      const { sid } = await login('alice@example.com', 'alice-password');
      const r = await call('GET', '/me', { cookie: `theme=dark; sid=${sid}; lang=en` });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ userId: 'u1', roles: ['member'], sudo: false });
    });
  });

  it('expires on idle, sliding with activity', async () => {
    await withApp({ idleMs: 30 * MIN }, async ({ call, login, clock }) => {
      const { sid } = await login('alice@example.com', 'alice-password');
      for (let i = 0; i < 3; i++) {
        clock.t += 29 * MIN;
        expect((await call('GET', '/me', { sid })).status).toBe(200);
      }
      clock.t += 30 * MIN;
      expect((await call('GET', '/me', { sid })).status).toBe(401);
    });
  });

  it('expires absolutely, however active', async () => {
    await withApp({ idleMs: 30 * MIN, absoluteMs: 2 * HOUR }, async ({ call, login, clock }) => {
      const { sid } = await login('alice@example.com', 'alice-password');
      // Keep it idle-fresh by touching it every 20 minutes.
      for (let i = 0; i < 5; i++) {
        clock.t += 20 * MIN;
        expect((await call('GET', '/me', { sid })).status).toBe(200);
      }
      clock.t += 20 * MIN; // exactly two hours
      expect((await call('GET', '/me', { sid })).status).toBe(401);
    });
  });

  it('logout kills the session server-side and clears the cookie', async () => {
    await withApp({}, async ({ call, login }) => {
      const { sid } = await login('alice@example.com', 'alice-password');
      const r = await call('POST', '/logout', { sid });
      expect(r.status).toBe(204);
      expect(r.text).toBe('');
      expect(r.setCookie).toBe('sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      expect((await call('GET', '/me', { sid })).status).toBe(401);
      expect((await call('POST', '/logout')).status).toBe(204);
    });
  });
});

describe('lockout', () => {
  it('locks an email after maxFailures and stops calling verify', async () => {
    await withApp({ maxFailures: 3, lockMs: 10 * MIN }, async ({ login, calls, clock }) => {
      for (let i = 0; i < 3; i++) expect((await login('alice@example.com', 'wrong')).status).toBe(401);
      const before = calls.length;
      const locked = await login('alice@example.com', 'alice-password');
      expect(locked.status).toBe(429);
      expect(locked.body).toEqual({ error: 'locked' });
      expect(locked.setCookie).toBeNull();
      expect((await login(' ALICE@example.com', 'alice-password')).status).toBe(429);
      expect(calls.length).toBe(before);
      // Other accounts are unaffected.
      expect((await login('bob@example.com', 'bob-password')).status).toBe(200);
      clock.t += 10 * MIN - 1;
      expect((await login('alice@example.com', 'alice-password')).status).toBe(429);
      clock.t += 1;
      expect((await login('alice@example.com', 'alice-password')).status).toBe(200);
    });
  });

  it('counts failures under the normalised email', async () => {
    await withApp({ maxFailures: 3 }, async ({ login }) => {
      await login('alice@example.com', 'wrong');
      await login('Alice@Example.com', 'wrong');
      await login(' alice@example.com ', 'wrong');
      expect((await login('alice@example.com', 'alice-password')).status).toBe(429);
    });
  });

  it('locks unknown emails the same way', async () => {
    await withApp({ maxFailures: 2 }, async ({ login }) => {
      expect((await login('ghost@example.com', 'x')).status).toBe(401);
      expect((await login('ghost@example.com', 'x')).status).toBe(401);
      expect((await login('ghost@example.com', 'x')).status).toBe(429);
    });
  });

  it('resets the count on success and after the lock expires', async () => {
    await withApp({ maxFailures: 3, lockMs: MIN }, async ({ login, clock }) => {
      await login('alice@example.com', 'wrong');
      await login('alice@example.com', 'wrong');
      expect((await login('alice@example.com', 'alice-password')).status).toBe(200);
      await login('alice@example.com', 'wrong');
      await login('alice@example.com', 'wrong');
      expect((await login('alice@example.com', 'alice-password')).status).toBe(200);
      for (let i = 0; i < 3; i++) await login('alice@example.com', 'wrong');
      clock.t += MIN;
      expect((await login('alice@example.com', 'wrong')).status).toBe(401);
      expect((await login('alice@example.com', 'wrong')).status).toBe(401);
      expect((await login('alice@example.com', 'alice-password')).status).toBe(200);
    });
  });
});

describe('sudo', () => {
  it('needs a session, then a password string', async () => {
    await withApp({}, async ({ call, login }) => {
      expect((await call('POST', '/sudo', { body: { password: 'alice-password' } })).status).toBe(401);
      const { sid } = await login('alice@example.com', 'alice-password');
      const r = await call('POST', '/sudo', { sid, body: {} });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'bad-request' });
    });
  });

  it('rejects a wrong password and leaves the session as it was', async () => {
    await withApp({}, async ({ call, login }) => {
      const { sid } = await login('alice@example.com', 'alice-password');
      const r = await call('POST', '/sudo', { sid, body: { password: 'bob-password' } });
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'invalid-credentials' });
      expect((await call('GET', '/me', { sid })).body.sudo).toBe(false);
    });
  });

  it('re-verifies against the session email, rotates the id, and expires after sudoMs', async () => {
    await withApp({ sudoMs: 5 * MIN }, async ({ call, login, calls, clock }) => {
      const { sid } = await login('Alice@example.com', 'alice-password');
      const r = await call('POST', '/sudo', { sid, body: { password: 'alice-password' } });
      expect(r.status).toBe(204);
      expect(r.text).toBe('');
      expect(calls[calls.length - 1]).toBe('alice@example.com');
      expect(r.sid).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      expect(r.sid).not.toBe(sid);
      expect(r.setCookie).toBe(`sid=${r.sid}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      expect((await call('GET', '/me', { sid })).status).toBe(401);
      expect((await call('GET', '/me', { sid: r.sid })).body).toEqual({ userId: 'u1', roles: ['member'], sudo: true });
      clock.t += 5 * MIN - 1;
      expect((await call('GET', '/me', { sid: r.sid })).body.sudo).toBe(true);
      clock.t += 1;
      expect((await call('GET', '/me', { sid: r.sid })).body.sudo).toBe(false);
    });
  });

  it('does not reset the absolute timeout when rotating', async () => {
    await withApp({ idleMs: 10 * HOUR, absoluteMs: HOUR }, async ({ call, login, clock }) => {
      const { sid } = await login('alice@example.com', 'alice-password');
      clock.t += 50 * MIN;
      const next = (await call('POST', '/sudo', { sid, body: { password: 'alice-password' } })).sid;
      clock.t += 10 * MIN;
      expect((await call('GET', '/me', { sid: next })).status).toBe(401);
    });
  });
});

describe('disabling a user', () => {
  const sudoAs = async ({ call, login }, email, password) => {
    const { sid } = await login(email, password);
    return (await call('POST', '/sudo', { sid, body: { password } })).sid;
  };

  it('401 without a session, 403 forbidden without the permission even in sudo', async () => {
    await withApp({}, async (app) => {
      expect((await app.call('POST', '/admin/users/u2/disable')).status).toBe(401);
      const member = await sudoAs(app, 'alice@example.com', 'alice-password');
      const r = await app.call('POST', '/admin/users/u2/disable', { sid: member });
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ error: 'forbidden' });
    });
  });

  it('does not grant through prototype role names', async () => {
    await withApp({}, async (app) => {
      const odd = await sudoAs(app, 'odd@example.com', 'odd-password');
      const r = await app.call('POST', '/admin/users/u2/disable', { sid: odd });
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ error: 'forbidden' });
    });
  });

  it('403 sudo-required for an admin who has not re-authenticated', async () => {
    await withApp({ sudoMs: 5 * MIN }, async (app) => {
      const { sid } = await app.login('root@example.com', 'root-password');
      const r = await app.call('POST', '/admin/users/u2/disable', { sid });
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ error: 'sudo-required' });
      const fresh = (await app.call('POST', '/sudo', { sid, body: { password: 'root-password' } })).sid;
      app.clock.t += 5 * MIN;
      expect((await app.call('POST', '/admin/users/u2/disable', { sid: fresh })).body).toEqual({ error: 'sudo-required' });
    });
  });

  it('disables the user and kills all of their sessions', async () => {
    await withApp({}, async (app) => {
      const bob1 = (await app.login('bob@example.com', 'bob-password')).sid;
      const bob2 = (await app.login('bob@example.com', 'bob-password')).sid;
      const alice = (await app.login('alice@example.com', 'alice-password')).sid;
      const root = await sudoAs(app, 'root@example.com', 'root-password');
      const r = await app.call('POST', '/admin/users/u2/disable', { sid: root });
      expect(r.status).toBe(204);
      expect(r.text).toBe('');
      expect((await app.call('GET', '/me', { sid: bob1 })).status).toBe(401);
      expect((await app.call('GET', '/me', { sid: bob2 })).status).toBe(401);
      expect((await app.call('GET', '/me', { sid: alice })).status).toBe(200);
      expect((await app.call('GET', '/me', { sid: root })).status).toBe(200);
      expect((await app.login('bob@example.com', 'bob-password')).status).toBe(401);
    });
  });

  it('404s for an unknown user', async () => {
    await withApp({}, async (app) => {
      const root = await sudoAs(app, 'root@example.com', 'root-password');
      const r = await app.call('POST', '/admin/users/nobody/disable', { sid: root });
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'not-found' });
    });
  });
});

describe('errors', () => {
  it('404s unknown routes and methods', async () => {
    await withApp({}, async ({ call }) => {
      for (const [m, p] of [['GET', '/login'], ['GET', '/nope'], ['POST', '/me'], ['GET', '/admin/users/u2/disable']]) {
        const r = await call(m, p);
        expect(r.status).toBe(404);
        expect(r.body).toEqual({ error: 'not-found' });
      }
    });
  });

  it('turns a dependency failure into 500 and keeps serving', async () => {
    await withApp({}, async ({ login, users }) => {
      users.explode = true;
      const r = await login('alice@example.com', 'alice-password');
      expect(r.status).toBe(500);
      expect(r.body).toEqual({ error: 'internal' });
      users.explode = false;
      expect((await login('alice@example.com', 'alice-password')).status).toBe(200);
    });
  });
});
