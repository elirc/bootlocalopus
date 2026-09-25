The starter is a password-reset service as it is often first written. It
works. It is also untestable: tokens come from `crypto.randomUUID()`, expiry
reads `Date.now()`, and email goes to a module-level `sendEmail`. To test
"a token expires after 30 minutes" you would have to wait 30 minutes; to test
"the email contains the token" you would have to monkey-patch a module.

**Dependency injection** here is nothing more than: take those things as
arguments. The test passes a fake clock it can move, a token generator that
returns `'tok-1'`, `'tok-2'`, and a mailer that records what it was given.
Production passes nothing and gets the real ones as defaults.

## Task

Export `RESET_TTL_MS = 30 * 60 * 1000`, `InvalidTokenError` and
`WeakPasswordError` (both extend `Error` with a matching `name`), and
`createPasswordResetService(deps)` where `deps` is:

| dep | shape | default |
| --- | --- | --- |
| `users` | `{ findByEmail(email) → Promise<user \| null>, updatePassword(userId, hash) → Promise }`, a user being `{ id, email }` | required |
| `mailer` | `{ send({ to, subject, text }) → Promise }` | required |
| `clock` | `() => epoch ms` | `Date.now` |
| `generateToken` | `() => string` | 32 random bytes as base64url (`node:crypto`) |
| `hashPassword` | `(plain) => Promise<string>` | required |

It returns:

- `requestReset(email)` — trims and lowercases `email` before looking it up.
  For a known user, generate a token valid for `RESET_TTL_MS` from now and
  send **one** email `{ to: user.email, subject: 'Reset your password', text }`
  whose `text` contains `https://app.example/reset?token=<token>`. A new request
  **invalidates** that user's earlier tokens. For an unknown email, send
  nothing and resolve normally — the response must not reveal which emails
  have accounts.
- `resetPassword(token, newPassword)` —
  1. unknown, already-used, superseded or expired token → reject
     `InvalidTokenError`. A token is expired when `clock() >= issuedAt + RESET_TTL_MS`.
  2. `newPassword` shorter than 12 characters → reject `WeakPasswordError`,
     and the token **stays usable** (the user just mistyped).
  3. otherwise `await users.updatePassword(user.id, await hashPassword(newPassword))`
     and burn the token: tokens are single-use.

Keep tokens in memory inside the service (a `Map` is fine).

## The traps

- Read `clock()` at the moment you need the time, every time — calling it
  once at creation and caching it defeats the fake.
- Check the token *before* the password: a weak password with a garbage
  token is an `InvalidTokenError`.
- Burn the token only after `updatePassword` succeeded. If the database
  write fails, the user should be able to try the same link again.
