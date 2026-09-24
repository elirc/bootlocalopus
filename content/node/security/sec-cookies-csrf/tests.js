import http from 'node:http';

const ORIGIN = 'https://app.example';

/** `name=value; Attr; Attr=x` -> { name, value, attrs: { attr: true | 'x' } } with lower-cased attribute names. */
const parseSetCookie = (line) => {
  const [pair, ...rest] = line.split(';').map((s) => s.trim());
  const i = pair.indexOf('=');
  const attrs = {};
  for (const a of rest) {
    if (!a) continue;
    const j = a.indexOf('=');
    attrs[(j < 0 ? a : a.slice(0, j)).toLowerCase()] = j < 0 ? true : a.slice(j + 1);
  }
  return { name: pair.slice(0, i), value: pair.slice(i + 1), attrs };
};

const cookiesOf = (res) => {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const c = parseSetCookie(line);
    out[c.name] = c;
  }
  return out;
};

const start = async (options = {}) => {
  const handler = solution.createAuthApp({
    users: { alice: 'wonderland', bob: 'builder' },
    allowedOrigin: ORIGIN,
    ...options,
  });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const request = (method, path, { cookie, origin, token, body } = {}) => {
    const headers = {};
    if (cookie !== undefined) headers.cookie = cookie;
    if (origin !== undefined) headers.origin = origin;
    if (token !== undefined) headers['x-csrf-token'] = token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    return fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  const login = async (username = 'alice', password = 'wonderland', extra = {}) => {
    const res = await request('POST', '/login', { body: { username, password }, origin: ORIGIN, ...extra });
    expect(res.status).toBe(200);
    const body = await res.json();
    const c = cookiesOf(res);
    return { res, body, sid: c.sid?.value, csrf: c.csrf?.value, cookie: `sid=${c.sid?.value}; csrf=${c.csrf?.value}` };
  };

  return { request, login, close: () => new Promise((r) => server.close(r)) };
};

describe('login', () => {
  it('sets a locked-down session cookie', async () => {
    const app = await start();
    try {
      const { res, body } = await app.login();
      expect(body.username).toBe('alice');
      const { sid } = cookiesOf(res);
      expect(sid).toBeDefined();
      expect(sid.value.length).toBeGreaterThanOrEqual(22);
      expect(sid.value).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(sid.attrs.httponly).toBe(true);
      expect(sid.attrs.secure).toBe(true);
      expect(String(sid.attrs.samesite).toLowerCase()).toBe('lax');
      expect(sid.attrs.path).toBe('/');
      expect(sid.attrs['max-age']).toBe('3600');
      expect(sid.attrs.domain).toBeUndefined();
    } finally { await app.close(); }
  });

  it('sets a readable csrf cookie matching the token in the body', async () => {
    const app = await start({ ttlSeconds: 600 });
    try {
      const { res, body } = await app.login();
      const { csrf, sid } = cookiesOf(res);
      expect(csrf).toBeDefined();
      expect(csrf.value).toBe(body.csrfToken);
      expect(csrf.value.length).toBeGreaterThanOrEqual(22);
      expect(csrf.value).not.toBe(sid.value);
      expect(csrf.attrs.httponly).toBeUndefined();
      expect(csrf.attrs.secure).toBe(true);
      expect(String(csrf.attrs.samesite).toLowerCase()).toBe('lax');
      expect(csrf.attrs.path).toBe('/');
      expect(csrf.attrs['max-age']).toBe('600');
    } finally { await app.close(); }
  });

  it('rejects bad credentials with 401 and no cookie', async () => {
    const app = await start();
    try {
      for (const body of [{ username: 'alice', password: 'nope' }, { username: 'mallory', password: 'x' }, { username: 'toString', password: 'x' }, {}]) {
        const res = await app.request('POST', '/login', { body });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'invalid credentials' });
        expect(res.headers.getSetCookie()).toEqual([]);
      }
    } finally { await app.close(); }
  });

  it('refuses a login posted from a foreign origin', async () => {
    const app = await start();
    try {
      const res = await app.request('POST', '/login', { origin: 'https://evil.example', body: { username: 'alice', password: 'wonderland' } });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'csrf check failed' });
      expect(res.headers.getSetCookie()).toEqual([]);
    } finally { await app.close(); }
  });

  it('issues a fresh session id every time, ignoring one the client sent', async () => {
    const app = await start();
    try {
      const a = await app.login('alice', 'wonderland', { cookie: 'sid=attacker-chosen-id' });
      const b = await app.login();
      expect(a.sid).not.toBe('attacker-chosen-id');
      expect(a.sid).not.toBe(b.sid);
      expect(a.csrf).not.toBe(b.csrf);
      const planted = await app.request('GET', '/me', { cookie: 'sid=attacker-chosen-id' });
      expect(planted.status).toBe(401);
    } finally { await app.close(); }
  });
});

describe('reading the session', () => {
  it('identifies the user from the cookie header, among other cookies', async () => {
    const app = await start();
    try {
      const { sid } = await app.login('bob', 'builder');
      const res = await app.request('GET', '/me', { cookie: `theme=dark; sid=${sid}; tracking=a=b` });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ username: 'bob' });
    } finally { await app.close(); }
  });

  it('401s without a cookie, or with an unknown one', async () => {
    const app = await start();
    try {
      for (const cookie of [undefined, '', 'sid=', 'sid=nope', 'theme=dark']) {
        const res = await app.request('GET', '/me', { cookie });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'unauthorized' });
      }
    } finally { await app.close(); }
  });

  it('does not CSRF-check reads, whatever the origin', async () => {
    const app = await start();
    try {
      const { cookie } = await app.login();
      const res = await app.request('GET', '/me', { cookie, origin: 'https://evil.example' });
      expect(res.status).toBe(200);
    } finally { await app.close(); }
  });

  it('expires sessions on the server, not just in the browser', async () => {
    let clock = 1_000_000;
    const app = await start({ ttlSeconds: 60, now: () => clock });
    try {
      const { cookie } = await app.login();
      clock += 59_000;
      expect((await app.request('GET', '/me', { cookie })).status).toBe(200);
      clock += 2_000;
      expect((await app.request('GET', '/me', { cookie })).status).toBe(401);
    } finally { await app.close(); }
  });
});

describe('state-changing requests', () => {
  it('accept a same-origin request with the right token', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      const res = await app.request('POST', '/transfer', { cookie, origin: ORIGIN, token: csrf, body: { amount: 5 } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.close(); }
  });

  it('accept a request with no Origin when the token matches', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      expect((await app.request('POST', '/transfer', { cookie, token: csrf })).status).toBe(200);
    } finally { await app.close(); }
  });

  it('check the session before CSRF: 401 without one', async () => {
    const app = await start();
    try {
      const res = await app.request('POST', '/transfer', { origin: ORIGIN, token: 'x', cookie: 'csrf=x' });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    } finally { await app.close(); }
  });

  it('refuse a cross-origin POST even with a valid cookie and token', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      for (const origin of ['https://evil.example', 'null', 'https://app.example.evil.com', 'http://app.example']) {
        const res = await app.request('POST', '/transfer', { cookie, origin, token: csrf });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'csrf check failed' });
      }
    } finally { await app.close(); }
  });

  it('refuse a missing or wrong token', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      expect((await app.request('POST', '/transfer', { cookie, origin: ORIGIN })).status).toBe(403);
      expect((await app.request('POST', '/transfer', { cookie, origin: ORIGIN, token: '' })).status).toBe(403);
      expect((await app.request('POST', '/transfer', { cookie, origin: ORIGIN, token: csrf.slice(0, -1) })).status).toBe(403);
      expect((await app.request('POST', '/transfer', { cookie, origin: ORIGIN, token: csrf + 'x' })).status).toBe(403);
    } finally { await app.close(); }
  });

  it('refuse a header that does not match the csrf cookie', async () => {
    const app = await start();
    try {
      const { sid, csrf } = await app.login();
      const res = await app.request('POST', '/transfer', { cookie: `sid=${sid}; csrf=other`, origin: ORIGIN, token: csrf });
      expect(res.status).toBe(403);
    } finally { await app.close(); }
  });

  it('refuse a token that belongs to a different session', async () => {
    const app = await start();
    try {
      const victim = await app.login('alice', 'wonderland');
      const attacker = await app.login('bob', 'builder');
      // The attacker plants their own (valid) csrf cookie and sends the matching header.
      const res = await app.request('POST', '/transfer', {
        cookie: `sid=${victim.sid}; csrf=${attacker.csrf}`, origin: ORIGIN, token: attacker.csrf,
      });
      expect(res.status).toBe(403);
    } finally { await app.close(); }
  });
});

describe('logout', () => {
  it('expires both cookies', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      const res = await app.request('POST', '/logout', { cookie, origin: ORIGIN, token: csrf });
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      const c = cookiesOf(res);
      expect(c.sid.value).toBe('');
      expect(c.sid.attrs['max-age']).toBe('0');
      expect(c.sid.attrs.path).toBe('/');
      expect(c.sid.attrs.httponly).toBe(true);
      expect(c.csrf.value).toBe('');
      expect(c.csrf.attrs['max-age']).toBe('0');
      expect(c.csrf.attrs.path).toBe('/');
    } finally { await app.close(); }
  });

  it('destroys the session on the server', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      await app.request('POST', '/logout', { cookie, origin: ORIGIN, token: csrf });
      // A client that ignores the expired cookie and replays it gets nothing.
      expect((await app.request('GET', '/me', { cookie })).status).toBe(401);
      expect((await app.request('POST', '/transfer', { cookie, origin: ORIGIN, token: csrf })).status).toBe(401);
    } finally { await app.close(); }
  });

  it('is CSRF-protected too', async () => {
    const app = await start();
    try {
      const { cookie, csrf } = await app.login();
      expect((await app.request('POST', '/logout', { cookie, origin: 'https://evil.example', token: csrf })).status).toBe(403);
      expect((await app.request('POST', '/logout', { cookie, origin: ORIGIN })).status).toBe(403);
      expect((await app.request('GET', '/me', { cookie })).status).toBe(200);
    } finally { await app.close(); }
  });

  it('only ends its own session', async () => {
    const app = await start();
    try {
      const one = await app.login();
      const two = await app.login();
      await app.request('POST', '/logout', { cookie: one.cookie, origin: ORIGIN, token: one.csrf });
      expect((await app.request('GET', '/me', { cookie: two.cookie })).status).toBe(200);
    } finally { await app.close(); }
  });
});

describe('routing', () => {
  it('404s anything else', async () => {
    const app = await start();
    try {
      const res = await app.request('GET', '/admin');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });
});
