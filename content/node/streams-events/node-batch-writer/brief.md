Importing a million rows one `INSERT` at a time takes an hour; batching them
into multi-row inserts of 500 takes a minute. So the import pipeline ends in
a `Writable` that collects rows into batches and sends each batch to the
database. The versions that ship first each lose something:

- calling `flush(batch)` **without waiting** for it — the callback fires at
  once, so the stream keeps accepting rows, dozens of inserts run at the same
  time, the connection pool is exhausted, and a failed insert is reported
  nowhere;
- forgetting the **last partial batch** — 1,000,003 rows in, 1,000,000 in the
  table, and nobody notices for a month;
- reusing one array and clearing it with `batch.length = 0` after the flush —
  the code that received the batch (a retry queue, a log, a test) now holds an
  empty array.

A `Writable`'s `write` callback is its backpressure: until you call it, the
stream buffers at most `highWaterMark` objects and then tells the producer to
stop. Calling it only after the flush finishes makes the database's speed the
speed of the whole pipeline.

## Task

Export `createBatchWriter({ size, flush })`, returning an **object-mode**
`Writable`:

- Collect written objects in order. When `size` have been collected, call
  `await flush(batch)` with a **new array** of exactly those objects, and
  do not complete the write (do not call its callback) until that promise
  settles.
- **Never** run two flushes at the same time.
- When the stream ends, flush the remaining objects (fewer than `size`) as a
  final batch — but never call `flush` with an empty array.
- If a flush rejects, fail the stream with **that error** (pass it to the
  callback); `pipeline` then rejects with it and no further batches are sent.
- Never reuse or modify an array after passing it to `flush`.

Implement the `write(chunk, encoding, callback)` and `final(callback)`
options of `new Writable({ objectMode: true, … })`.
