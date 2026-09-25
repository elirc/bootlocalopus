A video player seeking to minute 40, a download manager resuming at 80%, a
PDF viewer fetching page 300 first: all of them send `Range: bytes=…` and
expect **`206 Partial Content`** with exactly those bytes. Serve the whole
file instead and seeking downloads the whole file; serve the wrong bytes and
the resumed download is silently corrupt.

The header has more forms than the one everyone tests:

| `Range` | Meaning for a 1000-byte file |
| --- | --- |
| `bytes=0-99` | the first 100 bytes, `0`–`99` (the end is **inclusive**) |
| `bytes=900-` | from 900 to the end |
| `bytes=-100` | the **last** 100 bytes (`900`–`999`), not "up to 100" |
| `bytes=900-5000` | an end past the file is clamped: `900`–`999` |
| `bytes=1000-` | starts past the end: **`416 Range Not Satisfiable`** |

And the one that corrupts downloads: a client resuming a download sends
**`If-Range: <etag>`** — "send me the range only if the file is still the one
I started with; otherwise send the whole new file". Ignore it and the client
stitches the second half of the new file onto the first half of the old one.

## Task

**`parseRange(header, size)`** returns one of:

- `null` — serve the whole file: the header is missing, does not start with
  `bytes=`, is malformed (non-digits, `a-b` with `a > b`, `-`, spaces), or
  lists **several** ranges (a comma — multipart responses are out of scope,
  and ignoring the header is allowed);
- `'unsatisfiable'` — a start at or beyond `size`, a suffix `-0`, or any range
  on an empty file;
- `{ start, end }` — inclusive byte positions, with `end` clamped to
  `size - 1` and a suffix larger than the file meaning the whole file.

**`createFileHandler(files)`** — `files` maps a pathname to a `Buffer`.
Return a `(req, res)` handler for `GET`:

- Unknown path → `404`. Every response for a known file carries
  `accept-ranges: bytes` and `etag` (a strong ETag: `"` + a hash of the
  content + `"`).
- If an `If-Range` header is present and is not exactly the current ETag,
  ignore the `Range` header.
- No usable range → `200` with the whole file.
- A range → `206` with `content-range: bytes <start>-<end>/<size>`,
  `content-length: <end - start + 1>` and only those bytes.
- Unsatisfiable → `416` with `content-range: bytes */<size>` and an empty body.
