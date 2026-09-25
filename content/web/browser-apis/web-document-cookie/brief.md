`document.cookie` is the worst API in the browser: reading it gives you one
string, `a=1; b=2`, and writing to it sets **one** cookie per assignment,
using a completely different syntax. Cookie helpers are everywhere, and their
bugs are quiet:

- Splitting each pair on `=` truncates values that contain `=` — every
  base64 token ends with one.
- A value with `;` or a space written unencoded ends the cookie early.
  One with a `%` that is not an escape makes `decodeURIComponent` throw, and
  the whole parser with it.
- `SameSite=None` without `Secure` is **silently dropped** by the browser. So
  is a `__Host-` cookie with a `Domain` or a path other than `/`.
- "Deleting" a cookie with a different `Path` or `Domain` than the one it was
  set with leaves it in place, because it is a different cookie.

## Task

Export three functions.

### `parseCookies(header)`

`header` is a `document.cookie` / `Cookie` header string. Return a plain
object of name → value.

- Pairs are separated by `;`; trim each one. A pair without `=` is skipped.
- Split each pair at the **first** `=`; trim the name and the value.
- If the value is wrapped in double quotes, remove them. Then
  `decodeURIComponent` it; if that throws, keep the value as it was.
- If a name appears twice, keep the **first** (browsers send the cookie with
  the most specific path first).

### `serializeCookie(name, value, options = {})`

Return a string you could assign to `document.cookie`:
`name=<encodeURIComponent(String(value))>` followed by `; `-separated
attributes, in any order:

| option | attribute |
| --- | --- |
| `maxAge` (integer seconds) | `Max-Age=<n>` |
| `expires` (a `Date`) | `Expires=<expires.toUTCString()>` |
| `domain` | `Domain=<domain>` |
| `path` | `Path=<path>` |
| `secure: true` | `Secure` |
| `httpOnly: true` | `HttpOnly` |
| `sameSite` (`'strict'`, `'lax'`, `'none'`, any case) | `SameSite=Strict` / `Lax` / `None` |
| `partitioned: true` | `Partitioned` |

Omit attributes whose option is `undefined` or `false`. Throw a `TypeError`
when:

- `name` is empty or contains anything but letters, digits and
  ``!#$%&'*+-.^_`|~``;
- `maxAge` is not an integer, `expires` is not a valid `Date`, or `sameSite`
  is not one of the three values;
- `sameSite` is `none` or `partitioned` is set, without `secure`;
- the name starts with `__Secure-` without `secure`, or with `__Host-`
  without `secure`, without `path: '/'`, or **with** a `domain`.

### `deleteCookie(name, { path, domain } = {})`

Return the string that deletes it: an empty value with `Max-Age=0`, plus the
same `Path` and `Domain` it was set with (and `Secure` when the name has a
`__Secure-` or `__Host-` prefix, which those cookies need to be touched at all).
