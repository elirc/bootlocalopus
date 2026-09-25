Short-lived access tokens (15 minutes) plus a long-lived **refresh token** is
the standard way to keep a user signed in without a stolen access token being
good for a month. But a refresh token that can be used again and again is just
a month-long password in `localStorage`. Whoever steals it — a malicious
extension, an XSS, a leaked log — refreshes quietly in the background forever,
and the real user never notices.

**Rotation with reuse detection** closes that:

- Every refresh **consumes** the refresh token and returns a new one.
- All the refresh tokens descended from one login form a **family**.
- If a refresh token that was **already used** is presented again, someone
  has a copy. You cannot tell whether it is the attacker or the victim, so you
  **revoke the whole family** — every refresh token *and* every access token
  it produced. Both parties get logged out; only the real user can log back in.

The mistakes: rotating but not detecting reuse (the attacker just races the
user), detecting reuse but only rejecting that one token (the attacker's
freshly rotated one lives on), and letting rotation extend a session forever.

(Real systems often allow a few seconds of grace for two tabs refreshing at
once. That is a trade-off to make deliberately; this lesson has no grace
window.)

## Task

Export `class RefreshError extends Error` whose constructor takes a `code`
(set `name = 'RefreshError'`, `this.code`, and use the code as the message).

Export `createTokenService({ accessTtlMs = 900_000, refreshTtlMs = 1_209_600_000, familyTtlMs = 2_592_000_000, now = Date.now } = {})`
returning:

**`login(userId)`** → `{ accessToken, refreshToken }`, starting a new family.
Both tokens are 32 bytes from `crypto.randomBytes`, base64url.

**`refresh(refreshToken)`** → a new `{ accessToken, refreshToken }` in the same
family, or throws a `RefreshError`, checking in this order:

1. `'invalid'` — not a string, never issued, or its family has been revoked.
2. `'reuse-detected'` — the token was already used for a refresh. **Revoke
   the family first**, then throw.
3. `'expired'` — `now() >= issuedAt + refreshTtlMs` for this token, **or**
   `now() >= familyCreatedAt + familyTtlMs` (the family's absolute lifetime,
   counted from `login`; rotating never extends it).
4. Otherwise mark the token used and issue the new pair.

**`authenticate(accessToken)`** → `{ userId }` while the access token is live
(`now() < issuedAt + accessTtlMs` and its family is not revoked), else `null`.

**`logout(refreshToken)`** → revokes that token's family (used or not) and
returns `true`; `false` if the token is unknown or its family was already
revoked.

**`revokeAllForUser(userId)`** → revokes every family of that user that is
not already revoked (after a password change) and returns how many that was.

A revoked family never comes back. Time comes only from `now()`. Not graded,
but do it anyway: keep only a SHA-256 hash of each refresh token as the
lookup key, so a dump of the store cannot be replayed.
