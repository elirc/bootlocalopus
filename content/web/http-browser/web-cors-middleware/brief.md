CORS is enforced by the **browser**, configured by the **server**. The server
says which other origins may read its responses; the browser hides the
response from any page the server did not name. Two failure modes cover most
real incidents:

- **Too loose.** Reflecting whatever `Origin` arrives, or matching with
  `startsWith('https://app.example.com')` — which also admits
  `https://app.example.com.evil.io` — lets any site read your users' data with
  their cookies.
- **Too broken.** The preflight `OPTIONS` falls through to the router and gets
  a `404`; the `500` error handler forgets the CORS headers, so the browser
  reports a *CORS error* and hides the real one; `Access-Control-Allow-Origin: *`
  is combined with cookies, which browsers refuse outright.

A **preflight** is an `OPTIONS` request carrying
`Access-Control-Request-Method` (and usually `Access-Control-Request-Headers`).
The browser sends it before any "non-simple" request — a `PUT`, a JSON body,
an `Authorization` header — and only sends the real request if the answer
allows it.

## Task

Export `withCors(options, handler)` returning a `(req, res)` handler, where

```js
options = {
  origins,                          // string[] of exact allowed origins
  credentials = false,
  methods = ['GET', 'HEAD', 'POST'],
  allowHeaders = [],                // request headers a page may send
  exposeHeaders = [],               // response headers a page may read
  maxAge = 600,                     // seconds the browser may cache a preflight
}
```

**Every** response (preflight or not, allowed or not) carries `Vary: Origin`,
because the headers depend on the `Origin` and a shared cache must not serve
one origin's answer to another. Set it before calling `handler`.

An origin is **allowed** only if it is exactly equal to an entry of `origins`.
The literal `null` origin is never allowed. Never answer `*`.

**Preflight** — method `OPTIONS` *and* an `Access-Control-Request-Method`
header. The handler is **not** called. Answer `403` with an empty body and no
`Access-Control-Allow-*` headers if any of these fail:

- the origin is allowed;
- the requested method (compared upper-cased) is in `methods`;
- every name in `Access-Control-Request-Headers` (comma-separated, trim
  spaces, compare case-insensitively, ignore empty entries) is in
  `allowHeaders`.

Otherwise answer `204` with an empty body and:

- `Access-Control-Allow-Origin: <the request's origin>`
- `Access-Control-Allow-Methods: <methods joined with ", ">`
- `Access-Control-Allow-Headers: <allowHeaders joined with ", ">` (only if non-empty)
- `Access-Control-Max-Age: <maxAge>`
- `Access-Control-Allow-Credentials: true` (only if `credentials`)

**Any other request** is passed to `handler`. If its origin is allowed, first
set `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`
(if `credentials`) and `Access-Control-Expose-Headers` (joined, if non-empty),
so they are on the response even when the handler answers `500`. If the origin
is missing or not allowed, call the handler with no CORS headers: do **not**
reject it. Same-origin `POST`s and server-to-server calls send such requests,
and the browser already hides the response from the pages that matter.
