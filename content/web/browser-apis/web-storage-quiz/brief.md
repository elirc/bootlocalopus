The browser gives you five places to keep data, and each has a failure mode
that only shows up in production:

| | Lifetime | Scope | Sent to the server | API |
| --- | --- | --- | --- | --- |
| Cookie | until `Expires`/`Max-Age`, or the session | domain + path | on every matching request | `document.cookie`, `Set-Cookie` |
| `localStorage` | until cleared | origin | never | synchronous, strings only |
| `sessionStorage` | until the tab closes | origin **and tab** | never | synchronous, strings only |
| IndexedDB | until cleared | origin | never | asynchronous, structured data, large |
| Cache Storage | until cleared | origin | never | `Request` → `Response` pairs, for service workers |

Everything except cookies is readable by **any script on the origin** —
yours, your analytics tag's and an XSS payload's alike. And browsers may
evict any of it: under storage pressure, in private windows, or (Safari)
after seven days without a visit.
