Two support agents open the same customer record. Agent A fixes the address
and saves. Agent B, still looking at the old copy, fixes the phone number and
saves — and silently puts the old address back. Nobody gets an error; the
change A made is just gone. This is the **lost update**, and every API that
does `GET` → edit → `PUT` has it until it uses **conditional requests**.

HTTP already has the machinery:

- Every response for a resource carries an **`ETag`** — a quoted version tag,
  like `"3"`.
- A client that wants to write sends back the tag it read in **`If-Match`**.
  The server applies the write only if the resource is still at that version;
  otherwise **`412 Precondition Failed`**, and the client must re-read.
- A server that refuses unconditional writes altogether answers
  **`428 Precondition Required`** when `If-Match` is missing.
- For reads, **`If-None-Match`** with the tag the client already has turns a
  `200` with a body into a bodiless **`304 Not Modified`**.

The trap is in *when* you check. Reading the request body is asynchronous. If
you compare `If-Match` first and write after `await readBody(req)`, a second
request can check against the same version while the first is still
uploading, and both writes succeed. **Read the body first, then check and
write with no `await` in between.**

## Task

Export `createDocsApi(store)`, returning a Node `(req, res)` handler. `store`
is a `Map` from id to `{ version, data }` (`version` a positive integer).
The ETag of a document is its version in double quotes: version 3 → `"3"`.

Routes are `/docs/<id>`; any other path → `404` `NOT_FOUND`. Methods other
than `GET` and `PUT` → `405` `METHOD_NOT_ALLOWED` with header
`allow: GET, PUT`.

**`GET /docs/:id`**

- Unknown id → `404` `NOT_FOUND`.
- `If-None-Match` is `*` or a comma-separated list of tags, one of which
  matches the current ETag using **weak comparison** (`W/"3"` matches `"3"`)
  → `304` with the `etag` header and an **empty body**.
- Otherwise `200` `{ "data": data }` with the `etag` header.

**`PUT /docs/:id`**, body `{ "data": { … } }`. Checks in this order:

1. Body is not JSON, or `data` is not a plain object → `400` `INVALID_BODY`.
2. Unknown id → `404` `NOT_FOUND` (this API does not create with `PUT`).
3. No `If-Match` header → `428` `PRECONDITION_REQUIRED`.
4. `If-Match` is `*` (any current version), or a comma-separated list of tags
   one of which equals the current ETag using **strong comparison**: a weak
   tag (`W/"3"`) never matches. No match → `412` `PRECONDITION_FAILED`, with
   the **current** `etag` header so the client knows it is out of date.
5. Replace the document with `{ version: version + 1, data }` in the `store`
   and answer `200` `{ "data": data }` with the new `etag`.

Tags in a list may have spaces around the commas. Every response except the
`304` is JSON (`content-type: application/json`); errors use
`{ "error": { "code", "message" } }` (message wording is yours).
