Compression is where "it's only a few KB" becomes an outage. A 50 KB gzip
upload can expand to 50 MB — or, crafted on purpose, to 50 GB: a
**decompression bomb**. Limiting the *compressed* size does nothing; the limit
has to be on what comes **out** of the decompressor, and it has to stop the
decompressor as soon as it is exceeded, not after the whole thing has been
inflated into memory.

The other everyday bug is on the writing side. `createWriteStream(dest)`
creates `dest` immediately. If the source then fails to open, you are left
with an empty `report.csv.gz` that the next job happily uploads as "the
report". A failed compression must leave **no output file**.

## Task

Export three things from `node:zlib`-based code:

**`async function gzipFile(src, dest)`** — compress the file at `src` into a
new gzip file at `dest` (a streaming pipeline: read stream → `createGzip()` →
write stream). If anything fails, remove `dest` (ignore "it was never
created") and reject with the **original** error.

**`class TooLargeError extends Error`** — `name` `'TooLargeError'`, with a
`limit` property.

**`async function gunzipLimited(input, maxBytes)`** — `input` is a Readable
(or any async iterable) of gzip-compressed Buffers. Resolve a single `Buffer`
with the decompressed bytes.

- If the decompressed output would exceed `maxBytes`, reject with
  `new TooLargeError(…)` whose `limit` is `maxBytes`, and **stop**: destroy
  the pipeline so no more input is read and nothing more is inflated.
  Exactly `maxBytes` bytes is allowed.
- Invalid gzip data rejects with zlib's own error (its `code` is
  `'Z_DATA_ERROR'` or similar) — do not wrap or swallow it.

`pipeline` from `node:stream/promises` accepts an async generator function as
a stage (`async function* (source) { for await (const chunk of source) … }`);
throwing inside it tears the whole pipeline down.
