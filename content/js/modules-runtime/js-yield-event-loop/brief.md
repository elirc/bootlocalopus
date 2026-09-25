An admin endpoint re-scores 200,000 records in a loop. The loop is synchronous
CPU work, so for the 4 seconds it runs, this Node process answers **nothing
else**: health checks time out, the load balancer marks the instance dead,
and every other user's request waits. Making the function `async` does not
help, because `async` does not make code run in parallel; it only changes
what happens at an `await`.

The fix is to **process in chunks and yield to the event loop between them**.
The trap is *how* you yield. `await Promise.resolve()` (or `await null`)
schedules a **microtask**, and Node drains the entire microtask queue before
it looks at timers, I/O or incoming connections. A loop that yields with
microtasks still starves everything. You need a **macrotask**:
`setImmediate` (runs after pending I/O) or `setTimeout(fn, 0)`.

## Task

Export `processInChunks(items, fn, options = {})` returning a promise for the
array of results, `results[i] = fn(items[i], i)`.

Options: `{ chunkSize = 100, signal, onProgress }`.

- `fn(item, index)` is synchronous. Call it for every item, in order.
- Process up to `chunkSize` items back to back (a chunk), then **yield with a
  macrotask** before the next chunk. There is no need to yield after the last
  chunk. The first chunk may start immediately.
- After each chunk, call `onProgress(done, total)` if given (for example
  `(100, 250)`, `(200, 250)`, `(250, 250)`). An empty `items` resolves to
  `[]` without calling `fn` or `onProgress`.
- `signal` (an `AbortSignal`): if it is already aborted, reject with
  `signal.reason` without calling `fn`. Otherwise check it **before each
  chunk**; once it is aborted, reject with `signal.reason` and do not start
  another chunk. (A chunk that has started runs to its end.)
- If `fn` throws, reject with that error and process nothing after it.
