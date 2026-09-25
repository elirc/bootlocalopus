`GET /files/report.pdf` serves `path.join(root, 'report.pdf')`. Then someone
asks for `/files/..%2f..%2f.env` and gets your production secrets. Path
traversal is decades old and still ships every year, because each of the
"fixes" people reach for is incomplete:

- **Stripping `../`** — `....//` becomes `../` after one pass.
- **Checking before decoding** — `%2e%2e%2f` has no dots or slashes until you
  decode it. (And decoding **twice** is its own bug: `%252e` should be a file
  literally named `%2e`, not `.`.)
- **`full.startsWith(root)`** — with `root = /srv/files`, the path
  `/srv/files-private/key.pem` starts with it too.
- **Forgetting the platform** — on Windows `..\` is a separator as well.
- **Symlinks** — a link inside the root (from an unpacked upload, say) can
  point anywhere. Only `fs.realpath` tells you where a path really goes.

The approach that holds: decode once, resolve to an absolute path, and then
ask `path.relative(root, full)` whether you are still inside.

## Task

Export `resolveSafe(root, requestPath)`. `root` is an absolute directory;
`requestPath` is the raw, still percent-encoded path the client asked for
under it (for `/files/sub/a.txt` it is `sub/a.txt`). Return the absolute path
to serve, or `null`:

- Decode with `decodeURIComponent` **exactly once**; if that throws → `null`.
- A NUL byte (`\0`) anywhere → `null`.
- Resolve with `path.resolve(root, decoded)` — so an absolute path such as
  `/etc/passwd` resolves outside the root and is rejected, not re-rooted.
- Let `rel = path.relative(root, full)`. Return `null` if `rel` is `''` (the
  root itself), is `'..'`, starts with `'..' + path.sep`, or is absolute
  (another drive on Windows). A file actually named `..notes.txt` is inside the
  root and fine.
- Otherwise return `full`.

Export `createFileServer(root)` returning an `http.Server` (not listening):

- `GET /files/<rest>` → `resolveSafe(root, rest)`, where `rest` is the raw
  request path after `/files/` with any `?query` removed. `null` → `400`
  `{ "error": "bad-path" }`.
- The path does not exist or is not a regular file → `404` `{ "error": "not-found" }`.
- Its `fs.promises.realpath` is not inside `fs.promises.realpath(root)` (same
  `path.relative` test) → `404` too: a symlink out of the root is treated as
  missing.
- Otherwise `200` with the file's bytes streamed, `content-type:
  application/octet-stream`, `content-length` set, and
  `x-content-type-options: nosniff`.
- Anything else → `404` `{ "error": "not-found" }`. JSON errors have
  `content-type: application/json`.

Note: a test client has to send such paths raw. `fetch` and browsers
normalise `/files/../x` to `/x` before it ever leaves — attackers use `curl
--path-as-is`.
