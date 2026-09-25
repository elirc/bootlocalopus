Number formatting is where "works on my machine" means "works in English".
`(ratio * 100).toFixed(1) + '%'` prints `25.7%` for a German user who expects
`25,7 %`. A hand-written byte formatter prints `1000.0 KB` for 999 950 bytes.
And the reverse direction is worse: a German user types `1.234,5` into a
quantity field, `parseFloat` reads `1.234`, and the order is for one and a bit
widgets instead of twelve hundred.

`Intl.NumberFormat` knows every locale's separators, spacing and sign
conventions, and it can tell you what they are: `formatToParts(12345.6)`
returns the pieces with their types, including the `group` and `decimal`
separator strings.

## Task

Export three functions. `locale` is a BCP 47 tag.

### `formatPercent(ratio, locale, { digits = 0, signed = false } = {})`

`ratio` is a fraction (`0.257` means 25.7 %). Format it as a percentage in
`locale` with at most `digits` fraction digits (no trailing zeros forced). With
`signed: true`, show `+` on positive values and no sign on zero — including a
value that **rounds** to zero — the way a "change since last week" column
does. `formatPercent(0.2567, 'de', { digits: 1 })` is `'25,7 %'` (with the
locale's own space character); `formatPercent(0.125, 'en', { signed: true, digits: 1 })`
is `'+12.5%'`. Beware: `style: 'percent'` multiplies by 100 for you.

### `formatBytes(bytes, locale)`

`bytes` is a non-negative safe integer (else `RangeError`). Use decimal units
(1 kB = 1000 bytes): `byte`, `kilobyte`, `megabyte`, `gigabyte`, `terabyte`,
`petabyte`. Pick the largest unit in which the value is at least 1 (bytes
below 1000 stay in `byte`), and format with
`{ style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }`.
If rounding to one decimal would show `1000` or more of a unit (999 950 bytes
is 999.95 kB), use the next unit instead: `'1 MB'`, never `'1,000 kB'`.
In English: `0` → `'0 byte'`, `1536` → `'1.5 kB'`, `999949` → `'999.9 kB'`.

### `parseLocaleNumber(text, locale)` → `number` (or `NaN`)

Parse a number typed by a user of `locale`. Read that locale's group and
decimal separators from `formatToParts`. After trimming, accept: an optional
leading `-`; digits, optionally with group separators **between** digits where
every group after the first has **exactly three** digits; optionally the decimal
separator followed by one or more digits. If the locale's group separator is a
space character (French uses U+202F, Polish U+00A0), also accept a plain space
there, since that is what people type. Anything else returns `NaN` — including
`''`, `'12,5'` in English (a misplaced group separator, not twelve and a half),
and a number written with the **other** convention.
