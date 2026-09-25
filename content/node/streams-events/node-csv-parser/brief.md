"It's just CSV" is how `line.split(',')` ships. It works on the sample file,
and then the first real export arrives from a spreadsheet:

```
id,name,notes
7,"Smith, Jane","said ""call me"" on
the phone"
```

The comma inside quotes splits a name in two; the doubled quote is a literal
`"`; and the newline inside quotes means one **record** spans two **lines**,
so a "split into lines first" parser is wrong before it even looks at commas.
Add a file too big to load at once, and the parser has to do all of that on
**chunks** that can end anywhere — in the middle of a quoted field, between
the two quotes of `""`, or between `\r` and `\n`.

## Task

Export `class CsvError extends Error` (`name` `'CsvError'`, with a numeric
`row` property) and `createCsvParser({ header = true } = {})`, returning a
`Transform` whose writable side takes Buffers (or strings) and whose readable
side is in **object mode**.

Format (RFC 4180, the one Excel and Postgres write):

- Fields are separated by `,`; records end with `\n` or `\r\n`.
- A field that **starts** with `"` is quoted: it runs until the next `"` that
  is not doubled. Inside it, `,`, `\r` and `\n` are literal and `""` is one
  `"`. The quotes themselves are not part of the value.
- Everything is a string; no trimming, no type conversion. `a,,b` has an empty
  middle field.
- A completely empty line (nothing between two line endings) is **skipped**.
- A UTF-8 byte-order mark (`﻿`) at the very start of the input is
  dropped (Excel adds one). Multi-byte characters may be split across chunks.
- The last record may end without a newline.

Records are numbered from 1 in the order they appear (the header, if any, is
record 1; skipped blank lines are not counted).

- `header: true` — record 1 gives the field names; every later record is
  pushed as an object `{ [name]: value }`. A record with a different number of
  fields than the header fails with `CsvError`, `row` = that record's number.
- `header: false` — every record is pushed as an array of strings.
- Input that ends inside an open quoted field fails with `CsvError`, `row` =
  the number of the record it started.

Fail by passing the error to the transform's callback (so `pipeline` rejects
with it). The message is up to you.
