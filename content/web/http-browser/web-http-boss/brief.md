The product editor lives at `https://admin.shop.com`; the API at
`https://api.shop.com`. Every piece of this chapter meets in one endpoint, and
each one fails in the browser in its own way:

- The `PUT` sends JSON and an `If-Match` header, so it is **preflighted**. A
  preflight that reaches the router gets a `405` and the save button does
  nothing.
- The editor needs the `ETag` to send it back. Without
  `Access-Control-Expose-Headers: ETag`, `res.headers.get('etag')` is `null` in
  the browser even though DevTools shows the header.
- A `412` without CORS headers shows up as a *CORS error*, and nobody finds
  out it was a conflict.
- Two people edit the same product; the second save silently overwrites the
  first. That is the **lost update**, and `If-Match` is the HTTP answer to it:
  "apply this only if the resource is still the version I read".

## Task

Export `createApi({ origins, products })` returning a `(req, res)` handler.
`products` is an array of `{ id, name, price }`; each starts at version `1`.
Every JSON response has `content-type: application/json`.

**ETag** of a product: exactly `` `"${id}-v${version}"` `` (so `"mug-v1"`).

**CORS** (credentials are used):

- Every response has `Vary: Origin`.
- An origin is allowed only if it is exactly one of `origins`. For an allowed
  origin, **every** non-preflight response — `200`, `304`, `4xx` — carries
  `Access-Control-Allow-Origin: <origin>`,
  `Access-Control-Allow-Credentials: true` and
  `Access-Control-Expose-Headers: ETag`. Other origins get no CORS headers but
  are still served.
- A preflight (`OPTIONS` with `Access-Control-Request-Method`) is answered
  before routing, for any path: `204` when the origin is allowed, the method is
  `GET` or `PUT`, and every requested header is one of `content-type`,
  `if-match`, `if-none-match` (case-insensitive); with
  `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`,
  `Access-Control-Allow-Methods: GET, PUT`,
  `Access-Control-Allow-Headers: Content-Type, If-Match, If-None-Match` and
  `Access-Control-Max-Age: 600`. Otherwise `403` with an empty body and no
  `Access-Control-Allow-*` headers.

**Routes** (the path is `/products/<id>`; anything else is `404`
`{"error":"not found"}`, as is an unknown id):

- `GET` → `200` with `{ id, name, price }`, the `ETag` and
  `Cache-Control: no-cache`. If `If-None-Match` is `*` or a comma-separated
  list containing the current ETag (a `W/` prefix is ignored — the **weak**
  comparison), answer `304` with no body, the `ETag` and `Cache-Control`.
- `PUT` with a JSON body `{ name, price }`. Check **in this order**:
  1. No `If-Match` header → `428` `{"error":"precondition required"}`.
  2. `If-Match` is not `*` and none of its comma-separated tags equals the
     current ETag using the **strong** comparison (a `W/"…"` tag never
     matches) → `412` `{"error":"precondition failed"}`.
  3. The media type of `content-type` (before any `;`) is not
     `application/json` → `415` `{"error":"unsupported media type"}`.
  4. The body is not valid JSON, `name` is not a non-empty string, or `price`
     is not a non-negative integer → `400` `{"error":"invalid body"}`.
  5. Otherwise store the new name and price, increment the version and answer
     `200` with `{ id, name, price }` and the **new** `ETag`.

  Two concurrent `PUT`s carrying the same `If-Match` must not both succeed:
  exactly one gets `200`, the other `412`. Reading the body is asynchronous,
  so the version can change while you wait for it — make sure the `If-Match`
  still holds at the moment you write.
- Any other method on a product path → `405` with `Allow: GET, PUT` and
  `{"error":"method not allowed"}`.
