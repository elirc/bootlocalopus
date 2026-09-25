"Download invoice" works in every test, then a customer in Munich uploads
`Rechnung März.pdf` and gets a file called `Rechnung MÃ¤rz.pdf` — or the
request dies with `ERR_INVALID_CHAR`, because the file name ended up with a
newline in it. The `Content-Disposition` header looks trivial:

```
Content-Disposition: attachment; filename="report.csv"
```

but a header value is ASCII, and a file name is whatever a user typed. The
standard answer (RFC 6266 / RFC 8187) sends **two** names: a plain ASCII
fallback for old clients, and an encoded `filename*` that every current
browser prefers:

```
attachment; filename="Rechnung M_rz.pdf"; filename*=UTF-8''Rechnung%20M%C3%A4rz.pdf
```

The user-supplied name also has to be made safe first: a name like
`../../etc/passwd` must become `passwd` (clients differ in how they treat
paths), and control characters (`\r`, `\n`, tab, …) must never reach a
header — they are a header-injection attempt or a crash.

## Task

Export `contentDisposition(filename, { inline = false } = {})` returning the
header value.

1. **Clean** the name: keep only what follows the last `/` or `\`; remove
   every control character (code points below `0x20`, and `0x7F`); trim
   surrounding spaces. If nothing is left, use `download`.
2. The disposition type is `inline` when `inline` is true, else
   `attachment`.
3. If every character of the cleaned name is printable ASCII (`0x20`–`0x7E`)
   and none is `"`, `\` or `%`, return
   `` `${type}; filename="${name}"` ``.
4. Otherwise return
   `` `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}` ``:
   - `fallback` is the name with each character (code point) that is not
     printable ASCII, or is `"`, `\` or `%`, replaced by `_`;
   - `encoded` is the UTF-8 percent-encoding of the name in which only
     letters, digits and ``!#$&+-.^_`|~`` stay as they are.
     `encodeURIComponent` is close, but also leaves `'`, `(`, `)` and `*`
     unencoded — those must become `%27`, `%28`, `%29` and `%2A`.

Also export `createDownloadHandler(getFile)`: for `GET /download/<id>`,
`getFile(id)` returns `{ name, type, body }` or `undefined`. Respond `200` with
`content-type: <type>`, `content-disposition: contentDisposition(name)` and
the body; unknown id → `404`. A hostile `name` must not turn into a `500`.
