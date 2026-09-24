Chunks do not respect line boundaries: a JSON object can be split across
two reads. Any line-oriented parser must buffer the partial tail and wait.

## Task

Export `createNdjsonParser()`, a `Transform` stream in object mode that takes
raw chunks and emits one parsed object per line.

- handle a line split across chunk boundaries
- skip blank lines
- a malformed line emits an `error` on the stream
- flush any final line that has no trailing newline
- chunks split **bytes**, not characters: a multibyte UTF-8 character (`é` is
  two bytes, `☕` three) can straddle a boundary. Calling `chunk.toString()` on
  each half produces `caf��`. Decode with a `StringDecoder` (or
  `new TextDecoder()` with `{ stream: true }`), which carries the partial
  sequence over to the next chunk

Then export `sumField(source, field)`: consumes a readable of NDJSON and
resolves to the sum of that field across all records. It must **reject** if
anything fails — a malformed line, or the source stream itself erroring.
`source.pipe(parser)` does not forward a source error to the parser; use
`pipeline` from `node:stream/promises`, which propagates errors from every
stage and handles backpressure.