An avatar upload that trusts the client is a file host for attackers. The
`Content-Type` header and the file name are both typed by whoever sent the
request, so:

- `invoice.pdf` whose bytes are `<html><script>…` gets served back from your
  domain — stored XSS with your cookies in scope.
- `avatar.png` saved under its own name, into a folder served by a PHP or CGI
  handler, as `shell.php.png`… or just `shell.php`.
- A 4 GB "image" fills the disk.

The defence is layered, and every layer is cheap:

1. **Cap the size** before doing anything else.
2. **Sniff the type from the bytes** — the first few bytes ("magic numbers")
   of real formats are fixed — and allow only a short list. SVG is not on it:
   it is XML that can carry script.
3. Treat the client's type and name as **claims to check**, not facts.
4. **Never store under the user's file name.** Generate a random name with
   the extension *you* derived from the bytes. Keep the original only as a
   display string.
5. When you serve it back: the sniffed type, `X-Content-Type-Options: nosniff`
   and `Content-Disposition: attachment` (previous lesson).

## Task

Export `class UploadError extends Error` whose constructor takes a `code`
(`name = 'UploadError'`, `this.code`, message = code).

Export `inspectUpload({ filename, declaredType, bytes }, { maxBytes = 5_242_880, allowed = ['image/png', 'image/jpeg', 'image/gif', 'application/pdf'] } = {})`.

The known formats, by their leading bytes:

| type | magic bytes | extensions (first is canonical) |
| --- | --- | --- |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` | `png` |
| `image/jpeg` | `FF D8 FF` | `jpg`, `jpeg` |
| `image/gif` | `GIF87a` or `GIF89a` (ASCII) | `gif` |
| `image/webp` | `RIFF` at 0 and `WEBP` at byte 8 | `webp` |
| `application/pdf` | `%PDF-` (ASCII) | `pdf` |

Check in this order and throw an `UploadError` with the first failing code:

1. `'empty'` — `bytes` is not a `Uint8Array` (a `Buffer` is one), or has
   length 0.
2. `'too-large'` — `bytes.length > maxBytes`.
3. `'unsupported-type'` — the bytes match none of the formats, or the
   matched type is not in `allowed`.
4. `'type-mismatch'` — `declaredType`, lowercased with any `;parameters` and
   surrounding spaces removed, is not the sniffed type. A missing (`undefined`
   or `''`) or `application/octet-stream` declared type is "unknown" and
   passes.
5. `'extension-mismatch'` — the display name's extension (the text after its
   **last** `.`, lowercased; none if there is no `.`) is not one of the sniffed
   type's extensions.

The **display name**: if `filename` is not a string use `''`; keep what
follows its last `/` or `\`, delete control characters (`\x00`–`\x1f`,
`\x7f`), trim, and fall back to `'file'` if empty.

Return `{ type, ext, size, storageName, displayName }`: the sniffed type, its
canonical extension, the byte length, and `storageName` = 16 random bytes
(`crypto.randomBytes`) as hex + `'.'` + `ext`.
