In the OAuth authorization-code flow the user signs in at the auth server,
which redirects back to your app with a short-lived `code`; the app exchanges
the code for an access token. A single-page or mobile app cannot keep a client
secret, so anything that sees the redirect — a malicious app registered for
the same URL scheme, a leaky log, a browser extension — can exchange the code
itself.

**PKCE** (RFC 7636, "pixie") binds the code to the app instance that asked for
it:

1. The app generates a random **code verifier** and keeps it.
2. It sends only the **code challenge**, `base64url(sha256(verifier))`, with
   `code_challenge_method=S256` when it starts the flow.
3. At exchange time it sends the verifier. The server hashes it and compares.
   A stolen code is useless without the verifier, and the verifier never
   travelled through the redirect.

The server-side traps: accepting the `plain` method (the challenge *is* the
verifier, so the redirect leaks both), letting a code be tried more than
once (an attacker gets unlimited verifier guesses), matching redirect URIs by
prefix, and doing nothing when a code is replayed — RFC 6749 says a reused
code should **revoke** the token it already produced, because one of the two
callers is an attacker.

## Task

Export `class OAuthError extends Error`, whose constructor takes the OAuth
error string; set `name = 'OAuthError'`, `this.error` to it, and use it as the
message.

Export `createVerifier()` → 32 bytes from `crypto.randomBytes`, base64url (43
characters), and `challengeFor(verifier)` → `base64url(sha256(verifier))`.

Export `createAuthServer({ clients, codeTtlMs = 60_000, now = Date.now })`,
where `clients` is `{ [clientId]: { redirectUris: string[] } }`. It returns:

**`authorize({ clientId, redirectUri, codeChallenge, codeChallengeMethod, userId })`**
→ a new code (32 random bytes, base64url), valid for `codeTtlMs`. Throws:

- `'invalid_client'` if `clientId` is not an **own** key of `clients`;
- `'invalid_request'` if `redirectUri` is not **exactly** one of the client's
  `redirectUris`, if `codeChallengeMethod !== 'S256'`, or if `codeChallenge`
  is not 43 base64url characters (`/^[A-Za-z0-9_-]{43}$/`).

**`exchange({ code, clientId, redirectUri, codeVerifier })`** →
`{ accessToken, userId }` (the token: 32 random bytes, base64url). In order:

1. `codeVerifier` is not 43–128 characters from `[A-Za-z0-9._~-]` →
   `'invalid_request'`. (Nothing is consumed.)
2. The code was already exchanged → `'invalid_grant'`, **and** the access
   token issued for it is revoked.
3. The code is unknown, or expired (`now() >= issuedAt + codeTtlMs`) →
   `'invalid_grant'`.
4. **Consume the code now.** From here on it is spent, whatever happens next.
5. `clientId` or `redirectUri` differs from the ones the code was issued
   for, or `challengeFor(codeVerifier)` does not equal the stored challenge
   (compare with `crypto.timingSafeEqual`) → `'invalid_grant'`. A code burned
   by a failed attempt counts as exchanged but has no token to revoke.
6. Issue the token.

**`introspect(accessToken)`** → `{ active: true, userId, clientId }` for a
live token, else `{ active: false }`.
