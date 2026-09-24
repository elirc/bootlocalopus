A signed token is `payload.signature`. Anyone can read the payload —
signing proves it was not *changed*, not that it is secret. Getting the
verification wrong is how auth bypasses happen.

## Task

Export `createTokens({ secret, ttlMs = 3600_000, now = Date.now })` returning
`{ sign, verify }`.

- `sign(payload)` → ````<base64url json>.<base64url hmac>````. The payload gets an
  `exp` timestamp (`now() + ttlMs`) added before signing.
- `verify(token)` → the payload, or **throws**:
  - `invalid token` — wrong shape, unparseable, or bad base64
  - `bad signature` — the signature does not match
  - `token expired` — `exp` is at or before `now()`

Requirements:

1. HMAC-SHA256 via `node:crypto`, over the encoded payload segment.
2. Compare signatures with `crypto.timingSafeEqual`, not `===`. A byte-by-byte
   early return leaks the signature one character at a time. Use the default
   import (`import crypto from 'node:crypto'`) and call it as
   `crypto.timingSafeEqual(...)`: the grader checks it was called by watching
   that property, which a named `import { timingSafeEqual }` binding bypasses.
3. Tampering with the payload must fail with `bad signature` — check the
   signature **before** trusting anything in the payload.
4. Base64**url** (no `+`, `/` or `=`), because tokens travel in URLs.