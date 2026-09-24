A session cookie is sent by the browser on **every** request to your site —
including a form post that `evil.example` submits to you from its own page.
That is cross-site request forgery: the attacker cannot read your cookie, but
they can make the victim's browser *use* it. And a cookie without `HttpOnly`
is one XSS away from being posted to someone else's server.

The defences are small and they stack:

- **Cookie attributes.** `HttpOnly` (scripts cannot read it), `Secure` (HTTPS
  only), `SameSite=Lax` (not sent on cross-site POSTs in modern browsers),
  `Path=/`, and no `Domain` (so subdomains do not receive it).
- **Origin check.** Browsers send `Origin` on cross-origin and on POST
  requests. If it is present and is not you, refuse. `Origin: null` (sandboxed
  frames, some redirects) is present and is not you.
- **A CSRF token** for when `Origin` is absent (old browsers, some proxies):
  the server issues a random token bound to the session, sets it in a
  **readable** cookie, and the client echoes it in a header. A cross-site page
  can make the browser send cookies but cannot read them, so it cannot write
  the header.

## Task

Export `createAuthApp({ users, allowedOrigin, ttlSeconds = 3600, now = Date.now })`
returning a `(req, res)` handler. `users` maps username → password (plain text
here; the previous lesson is how you would really store them). Sessions live
in memory. All bodies are JSON.

**`POST /login`** with `{ "username", "password" }`

- `Origin` present and not equal to `allowedOrigin` → `403` `{ "error": "csrf check failed" }`
- wrong credentials → `401` `{ "error": "invalid credentials" }`
- otherwise `200` `{ "username", "csrfToken" }` and two `Set-Cookie` headers:
  - `sid=<session id>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<ttlSeconds>`
  - `csrf=<csrfToken>; Path=/; Secure; SameSite=Lax; Max-Age=<ttlSeconds>` (**not** `HttpOnly`: the client must read it)
- the session id and the token are each at least 16 random bytes
  (`crypto.randomBytes`), base64url. **Always a new session id**, even if the
  request already carried a `sid` cookie — reusing one an attacker planted is
  session fixation.

**Authentication** reads `sid` from the request's `Cookie` header (e.g.
`theme=dark; sid=abc; x=1`). A missing, unknown or expired session
(older than `ttlSeconds`, measured with `now()`) is unauthenticated.

**`GET /me`** → `200` `{ "username" }` or `401` `{ "error": "unauthorized" }`.
Reads are never CSRF-checked, whatever the `Origin`.

**`POST /transfer`** and **`POST /logout`** change state, so, in this order:

1. no valid session → `401` `{ "error": "unauthorized" }`
2. `Origin` present and not `allowedOrigin` → `403` `{ "error": "csrf check failed" }`
3. the `x-csrf-token` header must equal **both** the `csrf` cookie and the
   token issued to *this* session, else the same `403`. (A token from a
   different session, even your own other login, does not count.)

Then `/transfer` answers `200` `{ "ok": true }`. `/logout` destroys the session
server-side (the old `sid` must stop working even if a client replays it) and
answers `204` with both cookies expired:
`sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` and
`csrf=; Path=/; Secure; SameSite=Lax; Max-Age=0`.

Anything else → `404` `{ "error": "not found" }`.

Node's `fetch` has no cookie jar, so the grader reads `Set-Cookie` itself and
sends the `cookie` header by hand, exactly like a browser would.
