String-concatenated URLs work until the data gets interesting:

- `` `${base}/users/${name}` `` with a name of `a/b` requests a different
  path, and `..` walks **up** one (`/v2/users/..` is `/v2`).
- `new URL('orders', 'https://api.shop.com/v2')` is
  `https://api.shop.com/orders`: relative resolution replaces the last path
  segment unless the base ends with `/`. `new URL('/orders', base)` throws the
  whole prefix away.
- `'?q=' + search` breaks on `&`, `#` and `+`. And `if (value)` drops a
  legitimate `page=0` or `draft=false`.

`URL` and `URLSearchParams` get every one of these right, if you let them.

## Task

Export two functions. Both return a string (`url.href`).

### `apiUrl(base, segments, query = {})`

- `base` is an absolute URL, possibly with a path prefix, with or without a
  trailing slash: `https://api.shop.com/v2` and `https://api.shop.com/v2/`
  behave the same. It has no query string or hash.
- `segments` is a non-empty array of strings or numbers. Each one becomes
  **exactly one** path segment, appended after the base path and percent-encoded
  with `encodeURIComponent` (`a/b` → `a%2Fb`, `café` → `caf%C3%A9`).
- A segment that is `''`, `'.'` or `'..'` throws a `TypeError`.
- `query` entries are appended in order. `undefined` and `null` values are
  skipped, an array appends one entry per element, anything else is
  `String(value)` (so `0` and `false` are kept). No entries → no `?` at all.

```js
apiUrl('https://api.shop.com/v2', ['users', 'a/b', 42], { tag: ['x', 'y'], page: 0 })
// 'https://api.shop.com/v2/users/a%2Fb/42?tag=x&tag=y&page=0'
```

### `withQuery(href, patch)`

Returns `href` (absolute) with its query updated, leaving the path, the hash
and every parameter not named in `patch` untouched, in their original order.
For each key of `patch`:

- `undefined` or `null` → remove every value of that key;
- an array → replace every value of that key with one entry per element (an
  empty array removes the key);
- anything else → replace every value of that key with `String(value)`.

A key that was not in the query yet is added at the end (where a replaced key
ends up is up to you). The grader compares
**decoded** parameters, the path and the hash, so either encoding of a space
(`+` or `%20`) is fine.
