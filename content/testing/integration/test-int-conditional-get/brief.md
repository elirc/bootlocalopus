An editor fixes a typo in an article. Readers keep seeing the typo for a
day, because the CDN keeps getting `304 Not Modified`: the server built the
`ETag` when the article was created and never changed it. Another week, the
mobile app downloads every article in full on every refresh, because the
app sends `If-None-Match: W/"v3"` and the server compared that string with
`"v3"` and found no match.

Conditional requests are a contract between the server and every cache in
between. When the contract is right, clients revalidate cheaply. When it's
wrong, they serve stale data, or they never save a byte.

## The API under test

`createApp({ seed })` returns an unstarted `http.Server`. `seed` is an array
of `{ id, title, body }`.

- `GET /articles/:id` answers `200` with the article
  `{ id, title, body, version }` and two headers:
  - **`ETag`**: an opaque, quoted tag for the current content. Treat its
    value as opaque. The rewrite computes it differently.
  - **`Cache-Control`**, which must include the directive **`no-cache`**
    ("store it, but revalidate before reuse"). It may include others.
- If the request's **`If-None-Match`** matches the current ETag, the answer is
  **`304`** with an empty body, and it still carries the `ETag` and
  `Cache-Control` headers. Matching rules:
  - the header may be a **comma-separated list** of tags, and any one
    matching is enough;
  - the comparison is **weak**: `W/"abc"` matches `"abc"`;
  - `*` matches any existing article.
- A tag that doesn't match gets a normal `200`.
- `PUT /articles/:id` with a JSON body `{ title?, body? }` updates the
  article and answers `200` with it and its **new** `ETag`. After a change,
  the old ETag no longer matches.
- An unknown id is `404`.

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). The starter's
`withApp` starts a server on port `0`, seeds it, and **closes it in a
`finally`**.

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but uses
  content hashes as ETags and sends `Cache-Control: private, no-cache`. So
  read the ETag from a response and send it back. Never hardcode it, and
  check that `Cache-Control` *contains* `no-cache`.
- Six planted bugs must each make at least one of your tests fail.

## The trap

A 304 test that sends back the ETag it just received passes against a
server that answers `304` to **every** conditional request. You also need
the opposite test: a stale or unknown tag must get a full `200`. And the
most dangerous bug only appears in a sequence: fetch, change the article,
then revalidate with the tag you had.
