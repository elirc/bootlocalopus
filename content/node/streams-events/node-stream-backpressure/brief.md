An export job reads 2 million rows from the database and writes them to a
file. It runs out of memory at row 1.4 million. The code looks innocent:

```js
for await (const row of rows) out.write(toCsv(row)); // never waits
out.end();
```

`write()` never blocks. When the destination is slower than the source (a
disk, a socket, a gzip stream), every chunk it cannot take yet is **queued in
memory**. `write()` tells you this is happening — it returns `false` once the
queue is over the stream's `highWaterMark` — and the stream emits `'drain'`
when it has caught up. Respecting that signal is **backpressure**.

The fix has its own trap: `await new Promise((r) => out.once('drain', r))`
waits **forever** if the stream fails instead of draining. A disk-full error
is exactly when you must not hang.

## Task

Export `async function writeAll(writable, source)`. `source` is any iterable
or async iterable of chunks (strings or Buffers).

- Write the chunks **in order**. Whenever `write()` returns `false`, stop
  pulling from `source` until the stream emits `'drain'`.
- If the stream errors while you are waiting (or writing), **reject with that
  error** — never hang — and stop pulling from `source`.
- When `source` is exhausted, call `end()` and resolve only once the stream has
  **finished** (`'finish'`: every chunk has been handed to the underlying
  resource). Resolve the number of chunks written.
- If `source` itself throws, **destroy** the writable with that error (so the
  half-written destination is not mistaken for a complete one) and reject with
  it.

The tests use a deliberately slow writable with a small `highWaterMark` and
check how much is ever queued in it. `once` from `node:events` rejects when
the emitter emits `'error'` — a useful building block. `pipeline` from
`node:stream/promises` with `Readable.from(source)` is a valid alternative if
you count the chunks yourself.
