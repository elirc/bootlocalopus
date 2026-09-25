It is 2 a.m., the API is slow, and the only evidence is a 3 GB access log.
`readFile` + `split('\n')` needs the whole 3 GB in memory (and a string that
big fails outright — V8 caps strings at about 512 MB). The standard tool is
`readline` over a file stream: it hands you one line at a time, across chunk
boundaries, in constant memory.

```js
const lines = readline.createInterface({ input, crlfDelay: Infinity });
for await (const line of lines) { … }
```

`crlfDelay: Infinity` makes a `\r\n` split across two chunks count as one line
ending rather than two, however slowly the chunks arrive. The other habits
that matter on real logs: a truncated or garbage line is **counted and
skipped**, not fatal; and if the input stream fails half-way (a disk error, a
dropped network mount), the report must **fail** rather than quietly
summarise half the file — or hang. The `for await` loop above rejects when
the input errors; the older `rl.on('line', …)` plus `rl.on('close', …)`
style never hears about it.

## Task

Export `async function summarizeLog(input)`, where `input` is a Readable of
UTF-8 text with one request per line:

```
2024-05-01T10:00:00Z GET /api/users?page=2 200 35ms
```

A line is **valid** when, split on single spaces, it has exactly five parts:
a timestamp (not checked), a method (not checked), a path, a status that is
three digits from `100` to `599`, and a duration matching `<digits>ms`.
Lines ending in `\r\n` are fine. Empty lines are ignored. Any other line is
**malformed**.

Resolve:

```js
{
  requests: 1234,              // valid lines
  malformed: 3,                // non-empty invalid lines
  statuses: { '2xx': 1100, '3xx': 20, '4xx': 100, '5xx': 14 },  // all four keys, always; 1xx is not counted here
  p95Ms: 480,                  // null when requests is 0
  topPaths: [{ path: '/api/users', count: 700 }, …],             // at most 3
}
```

- `p95Ms` uses the **nearest-rank** method: sort the durations ascending and
  take the one at 1-based position `ceil(0.95 × n)`.
- `topPaths` counts requests per path **without the query string**
  (`/api/users?page=2` counts as `/api/users`), most requests first, ties
  broken by path (plain string `<`), at most three entries.
- If `input` errors, **reject** with that error.
