A session store that only has `create` and `get` works in the demo and fails
three ways in production:

- **Sessions never die.** A laptop left logged in at a library is logged in
  forever, because the only expiry is the cookie's — and a stolen cookie
  ignores `Max-Age`. The server has to enforce an **idle timeout** (no activity
  for 30 minutes) *and* an **absolute timeout** (12 hours after login, however
  active the session is). Sliding expiry alone lets an attacker keep a stolen
  session alive by touching it every 29 minutes.
- **The id never changes.** When a user logs in or gains privileges (enters
  sudo mode, switches org), the session id must be **rotated**: a new id, the
  old one dead. Otherwise an id an attacker planted or saw before login is now
  an authenticated one (session fixation).
- **"Log out everywhere" is impossible.** After a password change you must kill
  every other session that user has — which needs an index from user to
  sessions, kept in sync.

## Task

Export `createSessionStore({ idleMs = 1_800_000, absoluteMs = 43_200_000, now = Date.now } = {})`
returning:

| Method | Behaviour |
| --- | --- |
| `create(userId, data = {})` | starts a session and returns its id: at least 16 bytes from `crypto.randomBytes`, base64url. |
| `get(sid)` | `{ userId, data, createdAt, lastSeenAt }` for a live session, else `null`. A successful `get` **is activity**: it sets `lastSeenAt = now()`, and the returned object shows the new value. |
| `rotate(sid)` | a **new** id for the same live session (same `userId`, `data` and `createdAt`; `lastSeenAt = now()`). The old id stops working. `null` if `sid` is not live. |
| `destroy(sid)` | removes it; `true` if it was live, else `false`. |
| `destroyAllForUser(userId, { except } = {})` | removes every live session of that user except the id `except`; returns how many it removed. |
| `countForUser(userId)` | the number of **live** sessions that user has. |
| `sweep()` | deletes every expired session; returns how many it deleted. |

A session is **expired** when `now() - lastSeenAt >= idleMs` **or**
`now() - createdAt >= absoluteMs`. Expired sessions behave exactly like unknown
ones everywhere (`get`/`rotate` → `null`, `destroy` → `false`, not counted),
and are removed when they are found. **Rotation does not reset `createdAt`**:
otherwise rotating on every privilege change quietly defeats the absolute
timeout.

Anything that is not a live session id — `undefined`, `''`, a number,
`'__proto__'`, `'constructor'` — is simply not found. Timestamps come only from
`now()`; there are no timers.
