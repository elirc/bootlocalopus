**Boss: the nightly event import.** A partner drops a gzipped NDJSON file of
events every night — a few hundred MB compressed, a few GB of text. Your job
reads it, validates every line, inserts the good events in batches, writes
the bad lines to a rejects file for the partner, and reports what happened.
Everything in this chapter is in play:

- it has to **stream** end to end (gunzip → lines → batches) in bounded
  memory, with the database's speed setting the pace;
- a bad line is **data**, not a crash: it goes to the rejects file with its
  line number and the job carries on;
- a failed insert, a corrupt file or an operator's Ctrl-C (an `AbortSignal`)
  must **stop everything** — no more reading, no more inserts — and reject.

## Task

Export `async function importEvents({ input, insert, rejects, batchSize = 100, signal })`:

- `input` — a Readable of **gzip-compressed** bytes. Decompress it and split
  it into lines on `\n`; strip one trailing `\r` from each line. Line numbers
  start at `1` and count **every** line, including empty ones. A final line
  without a newline still counts; a file ending in `\n` has no extra empty
  line after it. Multi-byte UTF-8 characters may be split across chunks.
- Each **empty** line is skipped silently.
- Each other line must be JSON for an object with a non-empty string `id`, a
  non-empty string `type` and an integer `ts` (`Number.isInteger`). Other
  properties are kept as they are.
  - Not valid JSON → reject reason `invalid json`.
  - Valid JSON that is not such an object (an array, `null`, a missing or
    wrongly-typed field) → reject reason `invalid event`.
  - A rejected line is written to the `rejects` Writable as
    `` `${lineNumber}\t${reason}\t${line}\n` `` (the line without its `\r`).
    Respect backpressure: if `write()` returns `false`, wait for `'drain'`.
    Do **not** end `rejects`; the caller owns it.
- An event whose `id` was already seen **earlier in this file** is a
  duplicate: skip it and count it (it is not a reject).
- Valid events are passed to `await insert(batch)` in arrays of `batchSize`
  (the last one may be shorter; never empty), in file order, one insert at a
  time. Pass the parsed objects.
- Resolve `{ lines, inserted, rejected, duplicates }`.

Failures — each **rejects** the returned promise and stops reading `input`
(it ends up destroyed), with no further `insert` calls:

- `insert` rejects → reject with that error;
- the gzip data is corrupt or truncated → reject with zlib's error (its
  `code` starts with `Z_`);
- `signal` aborts → reject with an error whose `name` is `'AbortError'`. Check
  it before every `insert` as well, so an abort that happens *during* an
  insert stops the next one.

`pipeline(input, createGunzip(), splitLines, consume, { signal })` from
`node:stream/promises`, with async generator functions as stages, gives you
most of the failure handling for free.
