Users upload files; later you serve them back with their original name:

```js
res.setHeader('content-disposition', `attachment; filename="${file.name}"`);
```

Every part of that name is attacker-controlled, and a header is a tiny
language with its own syntax:

- **Quote injection.** A name of `x.txt"; filename*=UTF-8''payload.html`
  closes your quoted string and adds a parameter that browsers **prefer**
  over yours. The file now saves as `payload.html`.
- **CR/LF.** A name containing `\r\n` would end the header and start new ones
  (response splitting). Node refuses to send such a header — it throws
  `ERR_INVALID_CHAR` — which turns one weird filename into a 500 on every
  download of that file.
- **Paths.** `..\..\AppData\evil.bat` or `/etc/cron.d/x` as a *download
  name*: browsers mostly strip them, but you should not be relying on that.
- **Non-ASCII.** `Résumé 📄.pdf` cannot go in a plain quoted string at all.
  RFC 6266 says: send an ASCII `filename="…"` fallback **and** a
  percent-encoded UTF-8 `filename*=UTF-8''…` for clients that understand it.

## Task

Export `contentDisposition(name, { inline = false } = {})` returning the
header value. Build it in these steps:

1. **Clean.** If `name` is not a string, use `'download'`. Otherwise keep only
   what follows the last `/` or `\`, remove every control character
   (`\x00`–`\x1f`, `\x7f`), and trim spaces. If nothing is left, use
   `'download'`. Finally call `.toWellFormed()`: a lone UTF-16 surrogate
   (possible in any JS string) makes `encodeURIComponent` throw, and it
   becomes `U+FFFD` instead.
2. **Fallback.** Walk the cleaned name **by code point** (`for…of`, so an
   emoji is one character) and replace every character that is not printable
   ASCII (`\x20`–`\x7e`), and also every `"`, `\` and `%`, with `_`.
3. **Header.** Start with `attachment` (or `inline` when `inline` is true),
   then `; filename="<fallback>"`. If the fallback differs from the cleaned
   name, append `; filename*=UTF-8''<encoded>`, where `<encoded>` is
   `encodeURIComponent(cleaned)` with `'`, `(`, `)` and `*` also
   percent-encoded (`%27`, `%28`, `%29`, `%2A`) — RFC 5987 does not allow them
   bare.

Examples:

| name | header |
| --- | --- |
| `report.pdf` | `attachment; filename="report.pdf"` |
| `Résumé.pdf` | `attachment; filename="R_sum_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9.pdf` |
| `a"b.txt` | `attachment; filename="a_b.txt"; filename*=UTF-8''a%22b.txt` |

Export `createDownloadServer(files)` where `files` is a `Map` from id to
`{ name, type, body }` (`body` a string or Buffer). `GET /download/<id>` →
`200` with `content-type: <type>`, `content-disposition` from your function
(never inline), `x-content-type-options: nosniff`, and the body. An unknown id
or any other request → `404` with no body.
