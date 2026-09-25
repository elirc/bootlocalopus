After login, the app sends the user back where they were:
`/login?next=/invoices/42`. Ship `res.writeHead(303, { location: next })` and
you have an **open redirect**: a phishing email links to
`https://yourbank.com/login?next=https://yourbank.com.evil.io/login`, the
victim sees your real domain, signs in on your real page, and lands on a
pixel-perfect copy that asks them to "confirm their password". The same bug
leaks OAuth codes when `next` is a callback URL.

The obvious checks all fall over:

- `next.startsWith('/')` — `//evil.io/login` is a **protocol-relative** URL:
  another host.
- Rejecting `//` — browsers treat `\` like `/`, so `/\evil.io` is also another
  host; and they **strip tabs and newlines** from URLs, so `/<TAB>/evil.io`
  becomes `//evil.io` after your check.
- `next.startsWith('https://yourbank.com')` — `https://yourbank.com.evil.io`
  and `https://yourbank.com@evil.io` (userinfo!) both pass.
- A regex on the host — URLs are hard enough that the only reliable parser is
  the one the browser uses. Node's `URL` is the same WHATWG parser.

The robust recipe: reject anything odd outright, **parse** with `URL`, compare
the parsed **origin** exactly, and redirect to what you parsed, not to the
raw string.

## Task

Export `safeRedirect(next, { allowedOrigins = [], fallback = '/' } = {})`.
It returns `fallback` unless `next` passes every rule below, in which case it
returns the normalised target:

1. `next` is a string of at most 2048 characters, with no control characters
   (`\x00`–`\x1f` and `\x7f`, which includes tab, CR and LF).
2. **Relative path:** if `next` starts with `/`, its second character must not
   be `/` or `\`. Parse it with `new URL(next, 'http://base.invalid')`; the
   result's `origin` must be `'http://base.invalid'`. Return
   `pathname + search + hash` of the parsed URL.
3. **Absolute URL:** otherwise `new URL(next)` must parse (a throw means
   fallback), with protocol `http:` or `https:`, an empty `username` and
   `password`, and an `origin` exactly equal to one of `allowedOrigins`.
   Return the parsed `href`.

Export `createServer({ allowedOrigins = [] } = {})` returning an
`http.Server` (not listening). `GET /continue?next=<value>` responds `303`
with `location` set to `safeRedirect(<value>, { allowedOrigins })` (the query
parameter decoded by `URLSearchParams`; a missing one is not a string, so it
gets `/`), a `cache-control: no-store` header, and no body. Any other request
→ `404`.
