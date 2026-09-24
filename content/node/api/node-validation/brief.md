Query parameters are strings from strangers. `parseInt(req.query.limit)`
gives you `NaN` for `"abc"`, and `NaN` flows silently into your SQL.

## Task

Export `parsePagination(searchParams)` taking a `URLSearchParams` and
returning `{ limit, offset, sort, direction }`:

| param | rules |
| --- | --- |
| `limit` | integer, default `20`, min `1`, max `100` |
| `offset` | integer, default `0`, min `0` |
| `sort` | one of `createdAt`, `name`, `score`; default `createdAt` |
| `direction` | `asc` or `desc` (case-insensitive); default `desc` |

Invalid input **throws** an error with `status: 400` and a `fields` object
mapping the parameter name to a message. Collect **every** problem, not just
the first. Out-of-range numbers are errors, not silently clamped — a client
asking for 5,000 rows should be told no.

Also export `createServer()`: `GET /items` returns `200` with the parsed
options, or `400` with `{ error: 'invalid query', fields }`.