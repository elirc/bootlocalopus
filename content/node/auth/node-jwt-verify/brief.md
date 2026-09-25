Most JWT breaches are not broken cryptography. They are verification code that
**decodes** the token and forgets to **verify** it, or verifies it in a way the
attacker gets to steer:

- **`alg: none`.** The header says which algorithm signed the token. Code that
  believes it accepts `{"alg":"none"}` with no signature at all.
- **Algorithm confusion.** A verifier that picks the algorithm from the header
  can be talked into checking an HMAC with a *public* key as the secret. The
  fix is the same: the **server** decides the algorithm; the header must match
  it exactly.
- **Seconds versus milliseconds.** `exp` and `nbf` are Unix time in
  **seconds**. `exp < Date.now()` is always true, so nothing ever expires —
  or, the other way round, everything already has.
- **Audience by substring.** `aud` may be a string or an array. `aud.includes('api')`
  on the string `'api-internal'` is `true`: a token minted for another service
  is accepted by yours.

A JWT is three base64url segments, `header.payload.signature`. For HS256 the
signature is HMAC-SHA256 of the **exact text** `header + '.' + payload`, keyed
by the shared secret, base64url-encoded.

## Task

Export `class JwtError extends Error` whose constructor takes a `code`; set
`this.name = 'JwtError'`, `this.code = code` and use the code as the message.

Export `verifyJwt(token, { secret, issuer, audience, leewaySec = 0, now = Date.now })`.
It returns the payload object, or throws a `JwtError` with the **first**
failing check's code, in this order:

1. `'malformed'` — not a string, not exactly three segments, or a segment that
   is empty or not base64url (`/^[A-Za-z0-9_-]+$/`), or a header that is not a
   JSON object.
2. `'unsupported-alg'` — `header.alg` is anything but exactly `'HS256'`
   (`'none'`, `'HS512'`, `'RS256'`, `'hs256'`, missing).
3. `'bad-signature'` — the signature segment is not the HMAC of
   `segment0 + '.' + segment1` with `secret`. Compare it in constant time
   (`crypto.timingSafeEqual`, after checking the lengths are equal). Nothing
   in the payload is looked at before this check.
4. `'malformed'` — the payload is not a JSON object (arrays and `null` are not).
5. `'malformed'` — `exp` is missing or not a finite number. (This service
   requires every token to expire.) `nbf`, if present, must also be a finite
   number.
6. `'expired'` — `nowSec >= exp + leewaySec`, where `nowSec = now() / 1000`.
7. `'not-yet-valid'` — `nbf` present and `nowSec < nbf - leewaySec`.
8. `'bad-issuer'` — `issuer` was given and `payload.iss !== issuer`.
9. `'bad-audience'` — `audience` was given and `payload.aud` is neither
   exactly that string nor an array containing exactly that string.

`issuer` and `audience` are optional: when an option is `undefined`, that check
is skipped.

In real code you would use a maintained library (`jose`) and still pass it
`algorithms: ['HS256']`, `issuer` and `audience` explicitly — every one of
these checks is one a default configuration has been known to skip.
