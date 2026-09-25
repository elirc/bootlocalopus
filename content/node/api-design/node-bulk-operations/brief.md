An import screen uploads 500 contacts in one `POST /contacts/bulk`. Row 212
has a bad email. What should happen?

The naive endpoints get this wrong in opposite directions:

- **All-or-nothing by accident.** It validates in a loop, hits row 212, and
  returns `400`. But rows 1–211 were already inserted, so the client retries
  the whole file and creates 211 duplicates.
- **Fire and forget.** It runs `Promise.all(items.map(create))`: 500 inserts at
  once exhaust the connection pool, one rejection makes the whole response a
  `500`, and the client cannot tell which rows made it.

A bulk endpoint needs a **per-item result**: every item gets its own status,
in the same order as the request, and the overall response says "some of this
worked" — `207 Multi-Status` — so the client can fix and resend only the
failures.

## Task

Export `createBulkHandler({ validate, create, keyOf, maxItems = 100, concurrency = 4 })`
returning a Node `(req, res)` handler.

- `validate(item)` returns `null` for a valid item, or an error message string.
- `create(item)` is async and resolves to the created record, or rejects.
- `keyOf(item)` returns the item's natural key (an email, say). Only call it
  on items that passed `validate` — an invalid item may be `null`.

The request body must be `{ "items": [ … ] }`:

- Not JSON, not an object, `items` not an array, or `items` empty →
  `400` `INVALID_BODY`.
- More than `maxItems` items → `400` `BATCH_TOO_LARGE`, and **nothing** is
  created.

Then every item at index `i` gets exactly one result:

| situation | result |
| --- | --- |
| `validate` returns a message | `{ index: i, status: 422, error: { code: 'VALIDATION_FAILED', message } }` with that message |
| same `keyOf` as an **earlier valid** item in this batch | `{ index: i, status: 409, error: { code: 'DUPLICATE_IN_BATCH', message } }` (message wording yours) |
| `create(item)` resolves to `record` | `{ index: i, status: 201, data: record }` |
| `create(item)` rejects or throws | `{ index: i, status: 500, error: { code: 'INTERNAL', message: 'internal error' } }` |

The rules that separate working from correct:

- **Only valid, non-duplicate items reach `create`.** An invalid item does not
  "claim" its key: if row 3 is invalid and row 7 has the same email, row 7 is
  created.
- **At most `concurrency` calls to `create` are in flight at once**, started
  in index order; as each one settles, the next starts. Not one at a time, and
  not all at once.
- **One failure is one item's problem.** A rejected `create` fails that
  result only, and its error message is **not** sent to the client (it may
  contain SQL or hostnames) — always exactly `'internal error'`.
- **`results` is in index order**, whatever order the creates finish in.

Respond with JSON (`content-type: application/json`):

```json
{ "results": [ … ], "summary": { "total": 3, "succeeded": 2, "failed": 1 } }
```

The status is `201` when every result is `201`, otherwise `207` — including
when every item failed. Errors outside the per-item results use
`{ "error": { "code", "message" } }`.
