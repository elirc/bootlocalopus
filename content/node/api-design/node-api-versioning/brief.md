You need to rename a field. Every mobile app in the wild still sends and
reads the old name, and some of them will never be updated. The two classic
mistakes are breaking them anyway, or copying the whole handler into
`/v2/` and maintaining two forks forever.

What Stripe-style **date-based versioning** does instead: the handlers only
ever speak the **latest** shape. Each breaking change is a small object that
knows how to convert one step:

- `up(resource)` — an old-shaped request body into the next shape;
- `down(resource)` — a new-shaped response into the previous shape.

A client pins a version (`api-version: 2023-06-01`). Its request is upgraded
through every change **newer** than its version, oldest first; the response
is downgraded through the same changes, **newest first**. Adding a version
means adding one change object; no handler is touched.

## Task

### 1. The machinery: `versioned(handler, { versions, changes = CHANGES, defaultVersion })`

`versions` is the list of supported version strings (ISO dates, which sort
correctly as strings), and `changes` is an array of
`{ version, up, down }` — **in any order**. Return a Node `(req, res)`
handler:

1. The version is the `api-version` request header, or `defaultVersion` when
   it is absent. One not in `versions` → `400`
   `{ "error": { "code": "UNSUPPORTED_API_VERSION", "message": "…", "details": { "supported": versions } } }`.
2. Read the body. Empty → `undefined`. Not valid JSON → `400` code
   `INVALID_JSON`. A JSON object with a `data` object inside
   (`{ "data": { … } }`) has `data` upgraded; anything else goes through as is.
3. Call `handler(req, body)`; it returns `{ status, body }` in the latest
   shape. Only when `status` is **2xx** and the body's `data` is an object or
   an array, downgrade `data` — each element of an array, else the object.
   Error bodies pass through untouched.
4. Send JSON with `content-type: application/json` and an `api-version`
   response header naming the version used.

Never mutate the handler's objects: a handler may return records straight from
its store, and downgrading one in place corrupts it for every later client.
(The transforms you write below return new objects; the machinery must not
assign into what it is given either.)

### 2. The changes: export `CHANGES`

The customer resource is, at the latest version (`2024-01-01`),
`{ id, firstName, lastName, balanceCents }`. Two changes led here:

- **`2023-06-01`** — `balance` (a number of dollars, e.g. `12.34`) became
  `balanceCents` (an integer). `up` turns `balance` into
  `balanceCents: Math.round(balance * 100)`; `down` turns `balanceCents` into
  `balance: balanceCents / 100`. (`0.29 * 100` is `28.999999999999996`: that is
  what the rounding is for.)
- **`2024-01-01`** — `name` became `firstName` and `lastName`. `up` splits
  `name` at the **first** space (`'Grace Brewster Hopper'` → `'Grace'`,
  `'Brewster Hopper'`; `'Cher'` → `'Cher'`, `''`); `down` joins them with a
  space, without a trailing one when `lastName` is empty.

Both directions must handle **partial** resources (a PATCH that sends only
`name`): convert a field only if it is present, and leave every other field
exactly as it was. Remove the old field when adding the new one.
