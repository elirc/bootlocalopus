A list endpoint does `Number(params.get('limit') ?? 20)` and
`params.get('sort') as SortField`. Then `?limit=abc` reaches the database as
`LIMIT NaN` (a 500), `?limit=100000` dumps the whole table, `?sort=price`
becomes `ORDER BY price` on a column that does not exist, and
`?page=1&page=2` silently means page 1, because `get` returns the first
value and hides the second. The query string is user input like any other: it
needs parsing into a typed value, with a 400 listing what is wrong.

This lesson has **runtime** tests.

## Task

Export **`parseListQuery(input: string | URLSearchParams): ParseResult`**
(a string may start with `?`), where the result is
`{ ok: true, value: ListQuery }` or `{ ok: false, errors: ParamError[] }`
(types in the starter). Unknown parameters are ignored. A scalar parameter
that is present but **empty** (`?page=`) counts as absent.

| param | rule | default |
| --- | --- | --- |
| `page` | digits only (`/^\d+$/`), ≥ 1 | `1` |
| `limit` | digits only, ≥ 1; above 100 it is **clamped** to 100, not an error | `20` |
| `sort` | a field from `SORT_FIELDS`, optionally prefixed with `-` for descending; no prefix is ascending | `{ field: 'createdAt', direction: 'desc' }` |
| `status` | may repeat **and** may be comma-separated (`status=open&status=paid,shipped`); each non-empty trimmed value must be in `STATUSES`; deduplicated, first-seen order | `[]` |
| `q` | trimmed; blank means absent; at most 100 characters after trimming | `undefined` |

The value always has all five keys (`q: undefined` when absent).

Errors are `{ param, message }`, in the order `page`, `limit`, `sort`,
`status`, `q`, and all of them are collected:

- `page` / `limit`: `'must be a positive integer'`
- `sort`: `'must be one of createdAt, total, status'`
- `status`: one error per bad value: `'unknown value "<value>"'`
- `q`: `'must be at most 100 characters'`
- `page`, `limit`, `sort` or `q` given more than once: `'must be given once'`
  (that one error for the param, nothing else about it)

Also export **`toQueryString(query: ListQuery): string`**: the canonical
query string, without the `?`, built with `URLSearchParams` so encoding is
right. It includes **only values that differ from the defaults**, in the order
`page`, `limit`, `sort` (as `-field` or `field`), then one `status=` per
status, then `q`. The defaults give `''`. For every valid query,
`parseListQuery(toQueryString(query))` gives the query back.

Check allowed values with `includes` on the arrays, not with `in` on an
object: `?sort=constructor` must be rejected.
