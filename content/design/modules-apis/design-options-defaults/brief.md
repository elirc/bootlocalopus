An options object is the most-used API most teams ever design, and the
first version is always `{ ...DEFAULTS, ...options }`. It fails in four ways
that each cost someone an afternoon:

- `timeoutMs: options.timeoutMs || 10000` turns a deliberate `0` into ten
  seconds, and `retries: 0` into two retries.
- `{ retires: 0 }` (a typo) is silently ignored, so the caller who turned
  retries off still gets them.
- `headers: { authorization }` **replaces** the default headers instead of
  adding to them, and `accept: application/json` quietly disappears.
- The result shares objects with the caller and with `DEFAULTS`, so one
  client's `options.headers.x = 1` shows up in every other client.

## Task

`DEFAULTS` and a `closest(word, candidates)` helper are given. Export
`resolveOptions(options = {})` for an HTTP client, returning:

```js
{ baseUrl, timeoutMs, retries, retryOn, headers, keepAlive }
```

**Values**

- A key that is **absent or `undefined`** takes its default. Every other
  value — including `0`, `false`, `[]` and `null` — is the caller's choice
  and is validated as given.
- `baseUrl` is required: a string starting with `http://` or `https://`.
  Strip trailing slashes (`'…/v1//'` → `'…/v1'`).
- `timeoutMs` and `retries`: non-negative integers. `keepAlive`: a boolean.
  `retryOn`: an array.
- Any invalid value, or a missing `baseUrl`, throws a `TypeError`. Do not
  coerce: `'5000'` is invalid, not 5000.

**Nested defaults** — `headers` merges **over** `DEFAULTS.headers` rather than
replacing it, with header names lowercased (so `{ Accept: 'text/csv' }`
overrides the default `accept`).

**Unknown keys** throw a `TypeError` with exactly this message:

```
Unknown option "retires". Did you mean "retries"?
```

where the suggestion is `closest(key, knownKeys)`; when that returns `null`,
the message is just `Unknown option "verbose".` The known keys are `baseUrl`
plus the keys of `DEFAULTS`.

**Ownership** — the result is frozen, and so are its `headers` object and
`retryOn` array. It shares **nothing** mutable with the caller's input or
with `DEFAULTS`, and neither of those is ever modified: a caller who changes
their `headers` object after the call must not change the resolved options.

## The traps

- `||` and `??` are different. `??` still treats `null` as missing, which
  this API does not; compare with `undefined`.
- `Object.freeze` is shallow. Freezing the result does not freeze
  `result.headers`.
- Copy arrays and objects you are handed. Keeping the caller's reference means
  the "resolved" options can change after validation.
