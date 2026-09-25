A mobile client sends `Content-Type: application/json; charset=utf-8` and
every request fails with `415`. The server compared the header with `===`,
and the only test sent exactly `application/json`. A retry library treats
`500` as "try again", so a client with a malformed body hammers the API
with retries, because a JSON parse error came back as `500` instead of
`400`. Nobody tested what happens when a request is wrong **at the HTTP
level**.

The happy path is one request. The edges are many: the wrong method, the
wrong media type, a body that does not parse, a body that is too big. Each
has its own status code, and clients (retry logic, caches, SDKs) behave
differently for each one.

## The API under test

`createApp()` returns an unstarted `http.Server`. Errors use the envelope
`{ error: { code, message } }`. `message` is prose and may be reworded.

| request | contract |
| --- | --- |
| `GET /bookmarks` | `200` `{ items }` |
| `POST /bookmarks` | `201`, the bookmark `{ id, url, note }`, and a **`Location`** header `/bookmarks/<id>`. Ids are `'1'`, `'2'`… |
| `GET /bookmarks/:id` | `200` the bookmark, or `404` `NOT_FOUND` |
| `DELETE /bookmarks/:id` | `204`, or `404` `NOT_FOUND` |
| any other method on those two paths | `405` `METHOD_NOT_ALLOWED` with an **`Allow`** header listing the methods the path supports |
| any other path | `404` `NOT_FOUND` |

`POST /bookmarks` checks, in this order:

1. The media type must be `application/json`. **Parameters are allowed**
   (`application/json; charset=utf-8` is fine). Anything else, including
   `text/plain`, is `415` `UNSUPPORTED_MEDIA_TYPE`.
2. The body may be at most **1024 bytes** (`solution.MAX_BODY_BYTES`).
   Bigger is `413` `PAYLOAD_TOO_LARGE`, **even if it is valid JSON**.
3. A body that is not valid JSON is `400` `INVALID_JSON`.
4. `url` must be a string starting with `http://` or `https://`, otherwise
   `400` `VALIDATION`. `note` is an optional string.

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). The starter's `withApp`
starts a fresh server on port `0` and **closes it in a `finally`**.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**. It uses a
  route table, rewords every message, sends a charset on its responses, and
  lists `Allow` in a different order with different spacing. So compare the
  **set** of methods in `Allow`, not the raw string.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

`fetch` with a string body sends `Content-Type: text/plain;charset=UTF-8`
unless you set a header. So a "POST without JSON content type" test is easy
to write by accident, and so is a test that never sends the charset variant.
Send each content type on purpose. For the size limit, send **valid** JSON
that is too big. Otherwise you are testing the parser, not the limit.
