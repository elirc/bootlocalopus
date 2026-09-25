Redirects are three lines of code and a steady source of security reports.

**The open redirect.** After login you send the user back where they were:
`/login?next=/billing`. Then a phishing mail links to
`https://yourbank.com/login?next=https://yourbank.com.evil.io` — a real login
page on your real domain, which forwards the freshly logged-in user to a copy
of your site. "Only allow paths starting with `/`" is not enough either:

| `next` | where the browser goes |
| --- | --- |
| `//evil.io/x` | `https://evil.io/x` — protocol-relative URL |
| `/\evil.io` | `https://evil.io/` — browsers treat `\` as `/` |
| `/\t/evil.io` (a tab) | `https://evil.io/` — browsers strip tabs and newlines |

The robust check does what the browser does: **resolve** the value against
your own origin with the WHATWG `URL` parser and accept it only if the origin
did not change.

**The wrong status.** `302` after a `POST` is ambiguous (old clients re-POST);
`303 See Other` says "now GET this". And for canonical-URL redirects, `301`
lets clients turn a `POST` into a `GET` and drop the body; `308` keeps the
method.

**The canonicaliser that is itself an open redirect.** Stripping the trailing
slash from `//evil.io/` gives `Location: //evil.io`.

## Task

**`safeNext(value)`** returns a same-origin path to redirect to, or `'/'`:

- Anything that is not a string, does not start with `/`, or contains a
  control character (below `0x20`, or `0x7F`) → `'/'`.
- Resolve it: `new URL(value, 'http://app.internal')`. If the resulting
  `origin` is not `http://app.internal` → `'/'`. Otherwise return
  `pathname + search + hash` of the resolved URL.

**`createRedirectHandler({ checkPassword })`** returns a `(req, res)` handler:

- `POST /login?next=<value>` with a JSON body `{ "user", "password" }`: if
  `checkPassword(user, password)` returns `true` → `303` with
  `location: safeNext(next)` (a missing `next` gives `/`); otherwise `401`
  `{"error":"invalid credentials"}`.
- **Trailing slashes:** any other request whose path is longer than `/` and
  ends with `/` redirects to the same path without the trailing slash(es) and
  with the same query string — `301` for `GET`/`HEAD`, `308` for any other
  method. The `location` must start with exactly **one** `/` (collapse any
  run of leading slashes).
- Everything else → `404` `{"error":"not found"}`.

Every redirect has an empty body.
