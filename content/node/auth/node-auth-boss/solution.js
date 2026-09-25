import http from 'node:http';
import crypto from 'node:crypto';

const MAX_BODY = 64 * 1024;
const COOKIE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const send = (res, status, body, headers = {}) => {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const readJson = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Keep reading but stop storing: answering before the body is drained
    // makes many clients see a reset connection instead of the 413.
    if (size <= MAX_BODY) chunks.push(chunk);
  }
  if (size > MAX_BODY) throw new HttpError(413, 'too-large');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'bad-request');
  }
};

const requireStrings = (body, ...keys) => {
  for (const key of keys) if (typeof body[key] !== 'string') throw new HttpError(400, 'bad-request');
};

const readSid = (req) => {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === 'sid') return part.slice(eq + 1).trim();
  }
  return undefined;
};

const decodeSegment = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HttpError(404, 'not-found'); // '%E0' is not a user id
  }
};

const normaliseEmail = (email) => email.trim().toLowerCase();

export function createAuthApp({
  users,
  permissions = {},
  now = Date.now,
  idleMs = 1_800_000,
  absoluteMs = 43_200_000,
  sudoMs = 300_000,
  maxFailures = 5,
  lockMs = 900_000,
}) {
  // ---- sessions -----------------------------------------------------------
  const sessions = new Map(); // sid -> { userId, email, roles, createdAt, lastSeenAt, sudoUntil }

  const newSid = () => crypto.randomBytes(24).toString('base64url');

  const liveSession = (sid) => {
    if (typeof sid !== 'string') return undefined;
    const s = sessions.get(sid);
    if (!s) return undefined;
    const t = now();
    if (t - s.lastSeenAt >= idleMs || t - s.createdAt >= absoluteMs) {
      sessions.delete(sid);
      return undefined;
    }
    s.lastSeenAt = t;
    return s;
  };

  const sessionCookie = (sid) => `sid=${sid}; ${COOKIE_ATTRS}`;
  const clearCookie = `sid=; ${COOKIE_ATTRS}; Max-Age=0`;

  const authenticate = (req) => {
    const sid = readSid(req);
    const session = liveSession(sid);
    if (!session) throw new HttpError(401, 'unauthorized');
    return { sid, session };
  };

  const can = (roles, permission) => roles.some((role) => Object.hasOwn(permissions, role) && permissions[role].includes(permission));

  // ---- login throttling, per normalised email -----------------------------
  const attempts = new Map(); // email -> { failures, lockedUntil }

  const checkLock = (email) => {
    const a = attempts.get(email);
    if (!a || a.lockedUntil === undefined) return;
    if (now() < a.lockedUntil) throw new HttpError(429, 'locked');
    attempts.delete(email); // the lock has served its time: start counting afresh
  };

  const recordFailure = (email) => {
    const a = attempts.get(email) ?? { failures: 0, lockedUntil: undefined };
    a.failures++;
    if (a.failures >= maxFailures) a.lockedUntil = now() + lockMs;
    attempts.set(email, a);
  };

  // ---- routes -------------------------------------------------------------
  const login = async (req, res) => {
    const body = await readJson(req);
    requireStrings(body, 'email', 'password');
    const email = normaliseEmail(body.email);
    checkLock(email);

    const user = await users.verify(email, body.password);
    if (!user) {
      recordFailure(email);
      // One answer for "no such user" and "wrong password".
      throw new HttpError(401, 'invalid-credentials');
    }
    attempts.delete(email);

    // Session fixation: whatever id the browser arrived with is never promoted.
    const previous = readSid(req);
    if (previous !== undefined) sessions.delete(previous);

    const sid = newSid();
    const t = now();
    sessions.set(sid, { userId: user.id, email, roles: [...user.roles], createdAt: t, lastSeenAt: t, sudoUntil: 0 });
    send(res, 200, { userId: user.id }, { 'set-cookie': sessionCookie(sid) });
  };

  const me = (req, res) => {
    const { session } = authenticate(req);
    send(res, 200, { userId: session.userId, roles: session.roles, sudo: now() < session.sudoUntil });
  };

  const sudo = async (req, res) => {
    const { sid, session } = authenticate(req);
    const body = await readJson(req);
    requireStrings(body, 'password');
    const user = await users.verify(session.email, body.password);
    if (!user || user.id !== session.userId) throw new HttpError(401, 'invalid-credentials');

    // A privilege change gets a new id; createdAt carries over so the absolute timeout still holds.
    if (sessions.get(sid) !== session) throw new HttpError(401, 'unauthorized'); // logged out meanwhile
    sessions.delete(sid);
    const next = newSid();
    session.sudoUntil = now() + sudoMs;
    sessions.set(next, session);
    send(res, 204, undefined, { 'set-cookie': sessionCookie(next) });
  };

  const disableUser = async (req, res, targetId) => {
    const { session } = authenticate(req);
    if (!can(session.roles, 'user:disable')) throw new HttpError(403, 'forbidden');
    if (now() >= session.sudoUntil) throw new HttpError(403, 'sudo-required');

    const found = await users.disable(targetId);
    if (!found) throw new HttpError(404, 'not-found');
    for (const [sid, s] of sessions) if (s.userId === targetId) sessions.delete(sid);
    send(res, 204);
  };

  const logout = (req, res) => {
    const sid = readSid(req);
    if (typeof sid === 'string') sessions.delete(sid);
    send(res, 204, undefined, { 'set-cookie': clearCookie });
  };

  const route = async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const disable = /^\/admin\/users\/([^/]+)\/disable$/.exec(pathname);
    if (req.method === 'POST' && pathname === '/login') return login(req, res);
    if (req.method === 'GET' && pathname === '/me') return me(req, res);
    if (req.method === 'POST' && pathname === '/sudo') return sudo(req, res);
    if (req.method === 'POST' && pathname === '/logout') return logout(req, res);
    if (req.method === 'POST' && disable) return disableUser(req, res, decodeSegment(disable[1]));
    throw new HttpError(404, 'not-found');
  };

  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error instanceof HttpError) return send(res, error.status, { error: error.code });
      send(res, 500, { error: 'internal' });
    }
  });

  return { server };
}
