`GET /export` returns every order as JSON. The first version does
`res.json(await db.allOrders())`: 400 MB of rows in memory, then a
400 MB string, then nothing reaches the client for a minute. The streaming
version fixes that, and ships three new bugs:

- **No backpressure.** `for await (const row of rows) res.write(...)` pulls
  rows as fast as the database gives them, however slowly the client reads.
  A client on a bad connection makes the server buffer the whole export.
- **Nobody notices the client left.** The user closes the tab; the loop keeps
  reading the database cursor to the end, writing into a dead socket. A
  cursor that is never closed also holds a database connection.
- **A failure that looks like success.** The database dies half-way, the
  `catch` writes `]` and ends the response. The client gets valid JSON with
  half the orders, and a `200`.

## Task

Export `createExportHandler(getRows)`. `getRows()` returns a fresh async
iterable of row objects — think of it as a database cursor: calling
`return()` on its iterator closes it. The handler serves:

- **`GET /export`** → `200` with `content-type: application/json` and a
  body that is a JSON array of the rows, in order: `[`, then each row as
  `JSON.stringify(row)` separated by `,`, then `]`. No rows → `[]`.
  - **Stream** it: the client must receive the first rows before the source
    has finished.
  - **Backpressure:** do not pull the next row while the response is refusing
    writes (`write()` returned `false` and has not drained).
  - **Disconnect:** if the client goes away, stop reading and **close the
    source** (its iterator's `return()` must run).
  - **Failure:** if the source throws **before its first row**, respond
    `500` with `{"error":"export failed"}` (nothing has been sent yet, so an
    honest status is still possible). If it throws **after** the response has
    started, **destroy** the response so the client sees a broken transfer —
    never finish it with `]`.
- Anything else → `404` with `{"error":"not found"}`.

`pipeline(Readable.from(generator()), res)` from `node:stream/promises`
handles backpressure, disconnects and destruction for you; so does a
hand-written loop that waits for `'drain'` and watches `'close'`. The tests
bind a real server to port 0.
