An API credential object gets logged by an error handler:
`logger.error({ err, client })`. The log line now contains a live API key,
and so does every log aggregator, backup and support ticket it gets copied
into. `this._secret` is only private by convention: `JSON.stringify`,
`Object.keys`, object spread and `console.log` all see it.

Real privacy in a class is a `#private` field. It also gives you a
**brand check**: `#secret in value` is true only for objects that this class's
constructor actually created. `instanceof` only looks at the prototype chain,
so `Object.create(ApiCredential.prototype)` or a copy from a second installed
version of the package fools it.

## Task

Export a class `ApiCredential`:

- `constructor({ id, secret, scopes = [] })` — throws a `TypeError` if
  `secret` is not a non-empty string. Keep the secret in a `#private` field.
  After construction, `cred.secret` is `undefined` and **no own property of
  the instance** (enumerable or not) holds the secret.
- `id` — the id, readable as `cred.id`.
- `scopes` — an array of the scopes. Changing the array a caller got back
  (for example with `push`) must not grant a scope.
- `can(scope)` — `true` if the credential has that scope.
- `authorize(headers = {})` — returns a **new** headers object with every
  header from `headers` plus `authorization: 'Bearer <secret>'`. Does not
  mutate `headers`. This is the only way the secret leaves the object.
- `toJSON()` — returns `{ id, scopes, secret: '[redacted]' }`.
- `toString()` — returns `ApiCredential(<id>)`, so a template literal is safe.
- `[Symbol.for('nodejs.util.inspect.custom')]()` — returns
  `ApiCredential { id: '<id>', secret: [redacted] }`, so `console.log` and
  `util.inspect` never print the secret (also when the credential is nested
  inside another object).
- `static isCredential(value)` — `true` only for real instances. Must return
  `false` (not throw) for `null`, primitives, plain lookalike objects, and
  `Object.create(ApiCredential.prototype)`.

Calling a method on something that is not a real instance, like
`ApiCredential.prototype.authorize.call({})`, must throw a `TypeError` —
private fields do that for you.

The trap: `#secret in 42` itself throws a `TypeError`. Check that the value
is an object first.
