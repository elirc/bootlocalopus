The chapter boss: the login side of a real app, where each earlier lesson's
bug is one route away. A password guesser hammering one account. A session id
planted before login and still valid after it. An admin whose laptop was
left unlocked, so a passer-by can disable accounts. A user who was disabled
but stays logged in for the next twelve hours.

`node:http` and `node:crypto` only.

## Task

Export `createAuthApp(options)` returning `{ server }` — an `http.Server`,
not yet listening. Options (defaults in brackets):

- `users` — `verify(email, password)` resolves `{ id, roles }` or `null`;
  `disable(id)` resolves `true`, or `false` for an unknown id. Both may throw.
- `permissions` [`{}`] — `{ [role]: string[] }`, e.g. `{ admin: ['user:disable'] }`.
  Only **own** keys count.
- `now` [`Date.now`], `idleMs` [30 min], `absoluteMs` [12 h], `sudoMs` [5 min],
  `maxFailures` [5], `lockMs` [15 min].

Every response with a body is JSON (`content-type: application/json`), and
every error is `{ "error": "<code>" }`. 204s have no body.

**Sessions.** Ids are at least 16 random bytes, base64url. The cookie is
exactly `sid=<id>; Path=/; HttpOnly; Secure; SameSite=Lax`, read back from the
request's `cookie` header. A session is dead once `now() - lastSeenAt >= idleMs`
or `now() - createdAt >= absoluteMs`; every authenticated request is activity.
A missing, unknown or dead session → `401 unauthorized`.

| Route | Behaviour |
| --- | --- |
| `POST /login` `{ email, password }` | Both must be strings, else `400 bad-request`. Normalise the email (`trim().toLowerCase()`) and pass *that* to `verify`. `null` → `401 invalid-credentials` (the same for unknown users and wrong passwords). Success → `200 { userId }` with a **new** session cookie; if the request carried a `sid` cookie, that session is destroyed (session fixation). |
| `GET /me` | `200 { userId, roles, sudo }`, `sudo` being whether sudo mode is active. |
| `POST /sudo` `{ password }` | Requires a session (`401` first), then a string password (`400`). Re-checks it with `verify(sessionEmail, password)`; failure → `401 invalid-credentials`, session unchanged. Success → sudo mode until `now() + sudoMs` (active while `now()` is less), the session **moves to a new id** (keeping its `createdAt`), the old id stops working, and the response is `204` with the new cookie. |
| `POST /admin/users/:id/disable` | Session (`401`), then a role granting `user:disable` (`403 forbidden`), then active sudo (`403 sudo-required`). `disable(id)` false → `404 not-found`. Success → every session of that user is destroyed; `204`. |
| `POST /logout` | Destroys the session if there is one; always `204` with `sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`. |

**Lockout**, per normalised email, whether or not the account exists (else the
lock itself reveals who is a customer): each `401` from `/login` is a failure;
the `maxFailures`-th consecutive failure locks the email for `lockMs`. While
locked, `/login` for it answers `429 locked` **without calling `verify`**, even
with the right password. A success resets the count; so does the lock running
out.

**Everything else:** a body that is not a JSON object → `400 bad-request`; a
body over 64 KiB → `413 too-large`; an unknown route → `404 not-found`; any
other error (say `verify` throws) → `500 internal`, and the server keeps
serving.
