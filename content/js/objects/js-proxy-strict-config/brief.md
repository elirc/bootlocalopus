`config.DATABSE_URL` is `undefined`. The driver falls back to `localhost`,
staging quietly writes to the wrong database, and nobody notices for a week.
A typo in a config key should fail loudly at the line that made it.

A `Proxy` can do that: its `get` trap runs on every property read and can
throw for a key that does not exist. The naive version breaks things you did
not expect, because a lot of code reads properties you never wrote:

- `await config`, or returning `config` from an `async` function, reads
  `config.then` to check whether it is a promise.
- `JSON.stringify(config)` reads `config.toJSON`.
- `String(config)`, template literals and `console.log` read **symbol** keys
  such as `Symbol.toPrimitive` and `Symbol.iterator`.

Throw on any of those and the config object blows up the first time someone
logs it.

## Task

Export a class `UnknownKeyError` (extends `Error`, `name` is
`'UnknownKeyError'`, with a `key` property) and a function
`strictConfig(values, { name = 'config' } = {})` that returns a `Proxy` over
`values`:

- Reading a key that exists (`key in values`) returns its value — including
  keys whose value is explicitly `undefined`.
- Reading a **missing string key** throws `UnknownKeyError` with message
  `` `${name}: unknown key "${key}"` ``, e.g. `config: unknown key "DATABSE_URL"`.
- Reading any **symbol** key, or the string keys `then` and `toJSON`, never
  throws: it returns whatever `values` has there (normally `undefined`).
- Reading a key whose value is a **plain object** returns a strict view of it
  too, named with a dot: `config.db.hots` throws
  `config.db: unknown key "hots"`.
- `in`, `Object.keys`, spread and `JSON.stringify` behave as they would on
  `values`.
- The config is read-only: assigning, deleting or `Object.defineProperty`
  through the proxy throws a `TypeError` (at any depth), and `values` is
  never changed.

Use `Reflect` inside your traps to do "the normal thing" for the cases you do
not intercept.
