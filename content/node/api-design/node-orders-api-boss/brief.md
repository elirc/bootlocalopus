The orders API goes public next week. Partners will page through it with
scripts, retry every `POST` on a timeout, and edit orders from two browser
tabs at once. Everything this chapter covered now has to hold **at the same
time**, in one service.

## Task

Export `createOrdersApi({ now = Date.now } = {})`, returning a Node
`(req, res)` handler over an in-memory store (start empty).

An order is `{ id, customer, totalCents, status, createdAt }`: `id` is
`'ord_1'`, `'ord_2'`, … in creation order; `status` is `'pending'`, `'paid'`
or `'cancelled'`; `createdAt` is `new Date(now()).toISOString()`. Every order
also has a version (starting at 1, +1 per successful `PATCH`); its ETag is the
version in double quotes (`"1"`).

Every response is JSON (`content-type: application/json`); errors are
`{ "error": { "code", "message", "details"? } }`, message wording yours.

### Routes

| path | methods | otherwise |
| --- | --- | --- |
| `/orders` | `GET`, `POST` | `405` `METHOD_NOT_ALLOWED`, `allow: GET, POST` |
| `/orders/:id` | `GET`, `PATCH` | `405` `METHOD_NOT_ALLOWED`, `allow: GET, PATCH` |
| anything else | | `404` `NOT_FOUND` |

### `POST /orders` — create, idempotently

Body `{ "data": { "customer", "totalCents" } }`.

1. `idempotency-key` header present but not `/^[A-Za-z0-9_-]{1,64}$/` → `400`
   `INVALID_IDEMPOTENCY_KEY`.
2. Key seen before with a **successful** create: same raw body → replay the
   stored `201` response (same body, `location` and `etag`) plus header
   `idempotent-replayed: true`, creating nothing; different raw body → `422`
   `IDEMPOTENCY_KEY_REUSED`.
3. Body not JSON, or `data` not a plain object → `400` `INVALID_BODY`.
4. `customer` must be a non-empty string, `totalCents` a positive safe
   integer, and no other field is allowed → `422` `VALIDATION_FAILED` with
   `details` field → message for **every** problem.
5. Create with `status: 'pending'` → `201` `{ "data": order }` with
   `location: /orders/<id>` and `etag: "1"`. Remember the response under the
   key, if one was sent. Failed creates are not remembered.

### `GET /orders` — filter, sort, page

| param | meaning |
| --- | --- |
| `status` | equals; must be one of the three statuses |
| `status[in]` | comma-separated statuses, no empty items |
| `totalCents[gte]`, `totalCents[lte]` | integer (`/^-?\d+$/`) bounds, inclusive |
| `sort` | comma list of `totalCents`, `createdAt`, each optionally `-` (descending), no repeats; default `-createdAt` |
| `limit` | integer 1–100, default 20 |
| `cursor` | a `nextCursor` from an earlier page |

Every sort ends with an implicit tiebreaker: **creation order, oldest
first**. Any unknown key, repeated key or bad value → `400` `INVALID_QUERY`
with `details` keyed by the **raw key** (`'totalCents[gte]'`, `'sort'`,
`'limit'`, …), collecting every problem. A cursor that does not decode, or was
made for a different `sort` → `400` `INVALID_CURSOR`.

Answer `200` `{ "data": [orders], "nextCursor": string | null }`. Cursors are
opaque and URL-safe, record **positions, not offsets** (orders created while
a client pages must not make it see a row twice or skip one), and
`nextCursor` is `null` when there is nothing after this page.

### `GET /orders/:id`

`200` `{ "data": order }` with its `etag`, or `404` `NOT_FOUND`.

### `PATCH /orders/:id` — merge patch with optimistic locking

Checks, in this order:

1. `content-type` not `application/merge-patch+json` (parameters allowed,
   case-insensitive) → `415` `UNSUPPORTED_MEDIA_TYPE`.
2. Body not JSON → `400` `INVALID_JSON`; JSON but not a plain object → `400`
   `INVALID_PATCH`.
3. Unknown id → `404` `NOT_FOUND`.
4. No `if-match` → `428` `PRECONDITION_REQUIRED`. `if-match` not `*` and no
   tag in its comma-separated list strongly equal to the current ETag →
   `412` `PRECONDITION_FAILED` with the current `etag` header.
5. Patch contains `id`, `createdAt` or `totalCents` → `422`
   `READONLY_FIELD`, `details: { fields }` in patch order.
6. Apply it as a JSON merge patch (`null` deletes). The result must still
   have a non-empty string `customer`, a valid `status`, and no unknown
   fields → otherwise `422` `VALIDATION_FAILED` with `details`.
7. Store it (version + 1) → `200` `{ "data": order }` with the new `etag`.

Read the body before any check that looks at the stored order, and never
change a stored order in place before every check has passed.
