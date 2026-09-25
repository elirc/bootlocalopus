Every list endpoint grows filters and sorting, and the first version is always
`const status = url.searchParams.get('status')` sprinkled through a handler.
Then three things happen in production:

- `?sort=password_hash` sorts by a column nobody meant to expose, and
  `?sort=nonexistent` becomes a 500 from the database.
- `?status=open&status=closed` silently means "open", because `get()` returns
  the **first** value. The client thinks it filtered on both.
- `?sort=-price` pages through rows with equal prices in a different order on
  every request, so page 2 repeats half of page 1.

The fix is one parser that turns the query string into a **validated, typed
description** of the list request, driven by an allowlist. Handlers (and the
SQL builder behind them) only ever see that description.

## Task

Export `QueryError` and `parseListQuery(query, schema)`.

`query` is a `URLSearchParams` or a string (with or without a leading `?`).
`schema` looks like:

```js
{
  filters: {
    status: { type: 'string', ops: ['eq', 'in'] },
    price:  { type: 'integer', ops: ['eq', 'gte', 'lte'] },
    active: { type: 'boolean' },          // ops default to ['eq']
  },
  sortable: ['price', 'name', 'createdAt'],
  defaultSort: '-createdAt',
}
```

It returns `{ filters, sort }`:

```js
parseListQuery('?price[gte]=10&status[in]=open,held&sort=-price', schema)
// {
//   filters: [
//     { field: 'price', op: 'gte', value: 10 },
//     { field: 'status', op: 'in', value: ['open', 'held'] },
//   ],
//   sort: [{ field: 'price', dir: 'desc' }, { field: 'id', dir: 'asc' }],
// }
```

### Filters

- A key is `field` (meaning op `eq`) or `field[op]`. Filters appear in
  `filters` in the order their keys appear in the query.
- The keys `limit`, `offset` and `cursor` belong to pagination: ignore them.
  `sort` is handled below. Any other key that is not a known field with an
  allowed op is an error.
- Values are converted by `type`:
  - `string` — as is, but must not be empty;
  - `integer` — the whole value must match `/^-?\d+$/` and be a safe integer
    (`'12abc'` is an error, not `12`);
  - `boolean` — exactly `'true'` or `'false'`.
- Op `in` takes a comma-separated list and its `value` is an array of
  converted items; an empty item (`a,,b`) is an error.
- The **same key twice** (`status=a&status=b`) is an error. Refuse ambiguity
  rather than guess.

### Sort

- `sort` is a comma-separated list of fields, each optionally prefixed with `-`
  for descending: `sort=-price,name` → `[{ field: 'price', dir: 'desc' },
  { field: 'name', dir: 'asc' }]`.
- Every field must be in `sortable`, may appear only once, and no item may be
  empty. A repeated `sort` key is an error like any other repeated key.
- With no `sort` parameter, use `schema.defaultSort` (same syntax; trusted).
- **Tiebreaker:** unless the sort already includes `id`, append
  `{ field: 'id', dir: 'asc' }`, so the order is total and pages are stable.

### Errors

Collect **every** problem, then throw once: a `QueryError` (`name`
`'QueryError'`, `status` `400`, message `'invalid query'`) whose `details` is
an object keyed by the **raw query key** at fault (`'price[gte]'`, `'sort'`,
`'bogus'`) with a human-readable message as each value. The wording of the
messages is yours; the keys are graded.
