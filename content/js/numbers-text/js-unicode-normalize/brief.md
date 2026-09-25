`"café" === "café"` can be `false`. The first was typed on a Mac and stored as
`c a f e` + U+0301 COMBINING ACUTE ACCENT (five code points, **NFD**); the second
came from a Windows form as `c a f é` (four, **NFC**). They render identically,
and your search, your uniqueness check and your cache key all say they differ.

It gets worse with look-alikes. `ａｄｍｉｎ` (fullwidth letters, what a
Japanese IME produces) passes a "username taken?" check against `admin`; so does
`аdmin` with a Cyrillic `а`; so does `admin` with a zero-width space on the end.
Each of those is someone else logging in as something that **looks like** your
admin.

`String.prototype.normalize` fixes the first class of bugs:

- `'NFC'` composes: the canonical form for storage and comparison.
- `'NFKC'` / `'NFKD'` also fold **compatibility** characters — fullwidth
  letters, ligatures like `ﬁ`, superscripts, the Kelvin sign `K` — into their
  plain equivalents.
- `'NFD'` / `'NFKD'` split accented letters into base + combining mark, and
  the marks are then matchable as `\p{M}` (with the `u` flag).

Nothing normalises the Cyrillic `а` into a Latin `a`: for identifiers you
restrict the alphabet instead.

## Task

Export three functions.

### `sameText(a, b)`

`true` when the two strings are equal after NFC normalisation.

### `slugify(title)`

A URL slug: normalise with NFKD, remove every combining mark (`\p{M}`),
lowercase, turn every run of characters that are not `a-z` or `0-9` into a
single `-`, and strip leading and trailing `-`. If nothing is left, return
`'untitled'`.
`'Crème Brûlée!'` → `'creme-brulee'`; `'ﬁle №5'` → `'file-no5'`;
`'日本語'` → `'untitled'`.

### `canonicalUsername(input)` → `string` or `null`

Trim, normalise with NFKC, lowercase. Return the result if it matches
`^[a-z0-9_.-]{3,20}$`, otherwise `null`. So `'ＡＤＭＩＮ'` → `'admin'` (the
database's unique index will then catch the duplicate), while `'аdmin'`
(Cyrillic), `'admin​'` (zero-width space) and `'ève'` → `null`.
