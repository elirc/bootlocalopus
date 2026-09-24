The track boss. Build a small notes API with every layer wired together.
No frameworks — `node:http` and `node:crypto` only.

## Task

Export `createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {})`
returning `{ server }`. The server implements:

| route | behaviour |
| --- | --- |
| `GET /health` | `200` `{"status":"ok"}` — **no auth** |
| `POST /notes` | `201` the created note |
| `GET /notes` | `200` `{ items, total, limit, offset }` |
| `GET /notes/:id` | `200` the note, `404` if missing |
| `PATCH /notes/:id` | `200` the updated note |
| `DELETE /notes/:id` | `204` no body, `404` if missing |

**Auth.** Every route except `/health` requires
`Authorization: Bearer <token>`. Missing or wrong → `401`
`{"error":{"code":"UNAUTHORIZED","message":"authentication required"}}`.

**A note** is `{ id, title, body, tags, createdAt, updatedAt }`. Ids are
sequential strings from `'1'`.

**Validation** (→ `400`, code `BAD_REQUEST`, with a `details` object keyed by
field, collecting **all** failures):

- `title` — required, string, 1–80 characters after trimming
- `body` — optional string, defaults to `''`
- `tags` — optional array of non-empty strings, defaults to `[]`; anything else
  is invalid
- unknown fields are rejected with a message on that field's key

**PATCH** applies only the provided fields, validates them the same way,
requires at least one field, and bumps `updatedAt`.

**List** supports `?limit=` (1–50, default 10), `?offset=` (≥0, default 0) and
`?tag=` (exact match). `total` is the count **before** paging. Newest first:
`createdAt` descending, with the higher id first when two notes share a
timestamp. (Ids are sequential, so sorting by id descending gives the same
order.)

Every error uses the envelope `{"error":{"code","message","details?"}}`.