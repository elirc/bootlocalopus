`sha256(password)` is not password storage. A GPU tries billions of SHA-256
guesses a second, and without a salt one precomputed table cracks every user
who picked `hunter2` at once. Passwords need a **slow, salted, memory-hard**
function — scrypt ships in `node:crypto` — and the cost has to be recorded
next to the hash, because you *will* raise it later and old hashes must still
verify.

## Task

Export `DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 }` and three async-or-sync
functions:

### `hash(password, params = DEFAULT_PARAMS)` → `Promise<string>`

Produces exactly six `$`-separated fields:

```
scrypt$<N>$<r>$<p>$<salt>$<key>
```

- `N`, `r`, `p`: the parameters used, as plain decimal integers
- `salt`: **16** fresh random bytes (`crypto.randomBytes`), base64url
- `key`: the **32**-byte scrypt output of `(password, salt bytes, 32, { N, r, p })`, base64url

The grader recomputes `crypto.scryptSync(password, <decoded salt>, 32, { N, r, p })`
from your string, so the salt is used as raw bytes, not as its base64 text.
Use the async `crypto.scrypt` (promisified) in your code: `scryptSync` blocks
the event loop for every login.

### `verify(password, stored)` → `Promise<boolean>`

- Re-derives the key with the **salt and parameters from `stored`** (not the
  current defaults) and compares.
- Compare the keys with `crypto.timingSafeEqual`, never `===` or
  `Buffer.equals`: an early-exit comparison leaks how many leading bytes
  matched. (The grader cannot observe timing, so this one is on your honour —
  it is also exactly what a reviewer checks first.)
- **Never throws.** Anything malformed resolves `false`: a non-string, the
  wrong number of fields, a prefix other than `scrypt`, parameters that are not
  positive decimal integers, a salt that decodes to fewer than 16 bytes, a key
  that does not decode to exactly 32 bytes, parameters scrypt itself rejects
  (`N` not a power of two, or so large it exceeds scrypt's memory limit), or a
  non-string password. A login endpoint that 500s on a corrupted row is a bug;
  one that says "wrong password" is correct.

### `needsRehash(stored, params = DEFAULT_PARAMS)` → `boolean`

`true` when `stored` was made with different `N`, `r` or `p` than `params`, or
cannot be parsed at all. This is how you upgrade cost: after a successful
login, if `needsRehash(row.hash)`, hash the password you now hold and save it.
