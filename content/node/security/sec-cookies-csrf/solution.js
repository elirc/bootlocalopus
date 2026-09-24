import crypto from 'node:crypto';

const randomToken = () => crypto.randomBytes(18).toString('base64url');

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    // First occurrence wins; a later duplicate cannot override it.
    if (name && !(name in out)) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

/** Constant-time string comparison that tolerates different lengths and non-strings. */
const sameToken = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function createAuthApp({ users, allowedOrigin, ttlSeconds = 3600, now = Date.now }) {
  const sessions = new Map(); // sid -> { username, csrfToken, createdAt }

  const sidCookie = (value, maxAge) => `sid=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  const csrfCookie = (value, maxAge) => `csrf=${value}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`;

  const send = (res, status, body, headers = {}) => {
    if (body === undefined) {
      res.writeHead(status, headers);
      return res.end();
    }
    res.writeHead(status, { ...headers, 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      return {};
    }
  };

  const currentSession = (cookies) => {
    const sid = cookies.sid;
    if (!sid) return null;
    const session = sessions.get(sid);
    if (!session) return null;
    if (now() - session.createdAt >= ttlSeconds * 1000) {
      sessions.delete(sid);
      return null;
    }
    return { sid, ...session };
  };

  // Absent Origin is allowed here; the token check covers that case.
  const foreignOrigin = (req) => req.headers.origin !== undefined && req.headers.origin !== allowedOrigin;

  const csrfOk = (req, cookies, session) => {
    const header = req.headers['x-csrf-token'];
    return sameToken(header, cookies.csrf) && sameToken(header, session.csrfToken);
  };

  return async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const cookies = parseCookies(req.headers.cookie);

    if (req.method === 'POST' && pathname === '/login') {
      if (foreignOrigin(req)) return send(res, 403, { error: 'csrf check failed' });
      const { username, password } = await readJson(req);
      const known = typeof username === 'string' && Object.hasOwn(users, username);
      if (!known || !sameToken(password, users[username])) {
        return send(res, 401, { error: 'invalid credentials' });
      }
      // Never adopt an incoming sid: always mint a fresh one (session fixation).
      const sid = randomToken();
      const csrfToken = randomToken();
      sessions.set(sid, { username, csrfToken, createdAt: now() });
      return send(res, 200, { username, csrfToken }, {
        'set-cookie': [sidCookie(sid, ttlSeconds), csrfCookie(csrfToken, ttlSeconds)],
      });
    }

    if (req.method === 'GET' && pathname === '/me') {
      const session = currentSession(cookies);
      if (!session) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, { username: session.username });
    }

    if (req.method === 'POST' && (pathname === '/transfer' || pathname === '/logout')) {
      const session = currentSession(cookies);
      if (!session) return send(res, 401, { error: 'unauthorized' });
      if (foreignOrigin(req) || !csrfOk(req, cookies, session)) {
        return send(res, 403, { error: 'csrf check failed' });
      }
      if (pathname === '/transfer') return send(res, 200, { ok: true });

      sessions.delete(session.sid);
      return send(res, 204, undefined, { 'set-cookie': [sidCookie('', 0), csrfCookie('', 0)] });
    }

    return send(res, 404, { error: 'not found' });
  };
}
