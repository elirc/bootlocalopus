Unit tests of each handler function, with `req` and `res` mocked, miss the
bugs that customers hit. A `POST` that answers `200` instead of `201`. A
`DELETE` that someone left off the auth check. A validation error that comes
back as a `500`. A stack trace in the response body. They all sit in the
wiring, and the wiring only runs when a real request goes through a real
server.

An **integration test** starts the actual server on a free port, sends
requests with `fetch`, and asserts on what a client would see: the status,
the JSON, the headers. It uses no mocks, only the one fake you cannot avoid,
which here is the injected clock.

## The API under test

This is the notes API from the Node track boss.
`createApi({ token = 'secret-token', now } = {})` returns `{ server }`, an
unstarted `http.Server`.

| request | contract |
| --- | --- |
| `GET /health` | `200` `{ status: 'ok' }`, **no auth needed** |
| `POST /notes` | `201` and the created note `{ id, title, body, tags, createdAt, updatedAt }`. Ids are `'1'`, `'2'`… |
| `GET /notes` | `200` `{ items, total, limit, offset }`. Newest first, `?limit=` 1–50 (default 10), `?offset=`, `?tag=`. **`total` counts every match, before paging** |
| `GET /notes/:id` | `200` the note, `404` if missing |
| `PATCH /notes/:id` | `200` the note, changing **only the fields sent**. Every other field keeps its value |
| `DELETE /notes/:id` | `204` with no body, `404` if missing |

- **Auth.** Every route except `/health` needs
  `Authorization: Bearer <token>`. Without it: `401`, code `UNAUTHORIZED`.
- **Errors** always use the envelope `{ error: { code, message, details? } }`.
- **Validation** failures are `400`, code `BAD_REQUEST`, and `details` has
  one key per bad field. The `title` is required and is 1–80 characters after
  trimming, `tags` must be an array of non-empty strings, and unknown fields
  are rejected.
- **Unexpected failures** are `500`, code `INTERNAL`, and the `message` is
  generic. The **internal error's text must never reach the client.** You can
  cause one on purpose: `now` is injected, so pass a `now` that throws.
- `message` is prose for humans and may be reworded. `code`, the status and
  the `details` keys are the contract.

## Your task

Write a test file that uses `describe` / `it` / `expect` and Node's `fetch`
against the global `solution` (also available as `subject`). Start the server
on port `0`, read the real port from `server.address().port`, and **close it
in a `finally`**. The starter has a helper that does this.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**. It uses a
  route table, rewords every message, sends
  `content-type: application/json; charset=utf-8` and orders JSON keys
  differently. So assert on `status`, `error.code` and field values. Do not
  compare `message` strings, the raw body text or exact header values.
- Six planted bugs must each make at least one of your tests fail.

## The trap

The happy path hides most of these bugs. The paging bug only shows up when
there are more notes than one page holds. The PATCH bug only shows up if the
note already had tags. The auth bug is on one method only. So a single "401
without a token" check against `GET /notes` misses it. Go through the table
and write at least one test that could fail for each row.
