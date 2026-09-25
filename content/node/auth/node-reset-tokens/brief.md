"Forgot password" is an authentication bypass you build on purpose: whoever
holds the token *becomes* the user. So it gets the same care as a password,
and it collects mistakes:

- **Storing the raw token.** Anyone who can read the table (a backup, a
  read replica, a SQL injection elsewhere) can reset any account with a
  pending request. Store a **hash**. Because the token is 32 random bytes, a
  fast SHA-256 is enough — slow hashes are for low-entropy human passwords.
  And since you look the record up *by* its hash, there is no secret
  comparison to make constant-time.
- **Tokens that live forever, or twice.** A reset link must expire (30 minutes)
  and work **once**. Two requests racing with the same token must not both
  succeed.
- **Old links still working.** Requesting a new link must kill the previous
  one, and a successful reset must kill every outstanding link for that user.
- **Account enumeration.** "No account with that email" tells an attacker
  which emails are customers. Answer the same thing either way.
- **Forgetting the sessions.** A reset is often the victim taking their
  account back. Every existing session must be revoked afterwards.

## Task

Export `class ResetError extends Error` taking a `code` (set `name = 'ResetError'`,
`code`, and use the code as the message).

Export `createResetService({ users, mailer, tokens = new Map(), ttlMs = 1_800_000, now = Date.now, onPasswordChanged = () => {} })`:

- `users.findByEmail(email)` → `{ id, email }` or `undefined`;
  `users.setPassword(id, password)`. Either may return a promise — `await` them.
- `mailer.send(to, token)` — may return a promise; `await` it.
- `tokens` is the store: a `Map` from the **SHA-256 hex digest** of the token
  to `{ userId, expiresAt }`. Nothing else goes in it.

It returns:

**`requestReset(email)`** → always resolves `{ ok: true }`.

- Normalise the email with `trim().toLowerCase()` before looking it up.
- Unknown email → no mail, no stored record.
- Known → delete that user's existing records, then create a token of 32
  bytes from `crypto.randomBytes`, base64url; store its hash with
  `expiresAt = now() + ttlMs`; and `mailer.send(user.email, token)`.

**`resetPassword(token, newPassword)`** → resolves `{ ok: true }` or rejects
with a `ResetError`:

1. `'invalid-token'` — not a string, unknown, already used, or expired
   (`now() >= expiresAt`; delete it when you find it expired). All of these
   look the same to the caller.
2. `'weak-password'` — `newPassword` is not a string of at least 12
   characters. **The token stays valid**: a typo must not burn the link.
3. Otherwise **consume** the token and every other record for that user
   *before* the first `await`, then `await users.setPassword(userId, newPassword)`
   and `await onPasswordChanged(userId)` (the app revokes sessions there).

Because the consume happens before any `await`, two concurrent calls with the
same token cannot both get past step 1.
