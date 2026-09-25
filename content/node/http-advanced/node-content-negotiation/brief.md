The finance team wants the orders report as CSV; the dashboard wants JSON.
One URL can serve both — the client says what it accepts, the server picks —
and the hand-rolled version gets it wrong in three ways:

- `accept.includes('text/csv')` picks CSV for `text/csv;q=0, */*`, where
  `q=0` means "**not** CSV, anything else".
- It ignores **specificity**: the most specific range that matches a type sets
  its quality. In `text/*;q=0.2, text/csv;q=0.9, */*;q=0.5`, CSV is 0.9, and
  `text/html` would be 0.2, not 0.5.
- It forgets `Vary: Accept`, so a CDN caches the CSV and serves it to the next
  browser that asked for JSON.

## Task

**`negotiate(accept, available)`** — `accept` is the `Accept` header value (or
`undefined`), `available` the media types the server can produce, most
preferred first. Return the chosen type from `available` (spelled as in
`available`), or `null`.

- A missing or blank header accepts anything: return `available[0]`.
- The header is a comma-separated list of media ranges, each optionally
  followed by `;`-separated parameters. Ignore whitespace around parts and
  compare types case-insensitively. A range is `type/subtype`, `type/*` or
  `*/*`.
- A range's quality is its `q` parameter (default `1`). A `q` that is not a
  number from `0` to `1` makes that range **ignored**. Other parameters are
  ignored.
- For each available type, find the **most specific** matching range (exact
  beats `type/*` beats `*/*`) and use its quality; no matching range means
  quality `0`.
- Choose the highest quality above `0`; on a tie, the earlier entry in
  `available`. Nothing above `0` → `null`.

**`createReportHandler(getRows)`** returns a `(req, res)` handler.
`getRows()` returns an array of `{ id, name }`.

- `GET /report` negotiates between `application/json` and `text/csv` (in that
  order of preference):
  - JSON → `200`, `content-type: application/json; charset=utf-8`, body
    `JSON.stringify(rows)`;
  - CSV → `200`, `content-type: text/csv; charset=utf-8`, body `id,name\n`
    followed by one `<id>,<name>\n` per row (the tests use names without
    commas or quotes);
  - neither → `406`, `content-type: application/json; charset=utf-8`, body
    `{"error":"not acceptable","available":["application/json","text/csv"]}`.
- Every `/report` response, including the `406`, carries `vary: Accept`.
- Any other method or path → `404` `{"error":"not found"}`.
