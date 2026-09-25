The price field says `12abc` and the order goes through at £12, because
`parseFloat` reads as far as it can and stops without complaint. The field
says nothing at all and the refund is for £0, because `Number('')` is `0`.
Somebody types `1,234.50` and gets £1, because `parseFloat` stops at the comma.
`1e3` becomes a thousand. And `Math.floor(parseFloat('19.99') * 100)` is
`1998`, because `19.99` is really `19.989999…` in binary.

Money arrives as **text** and should be stored as an **integer number of minor
units** (cents, pence). The conversion between the two should never go through
a floating-point number at all: validate the text, then build the integer from
its digits.

## Task

Export two functions. `digits` is the number of minor-unit digits of the
currency: `2` for USD/EUR/GBP (the default), `0` for JPY, `3` for KWD.

### `parseAmount(text, digits = 2)` → integer or `null`

After trimming surrounding whitespace, accept exactly this shape and nothing
else:

1. an optional leading `-` (no `+`, no space after the sign);
2. an integer part that is either plain digits (`1234`) or correctly grouped
   with commas (`1,234`, `12,345,678` — groups of exactly three after the
   first group of one to three); leading zeros are fine;
3. optionally a `.` followed by **1 to `digits`** digits. With `digits = 0`
   there is no fractional part at all.

Return the amount in minor units: `'12.5'` → `1250`, `'-0.05'` → `-5`,
`'1,234'` with `digits = 0` → `1234`. `'-0'` returns `0`, not `-0`.

Return `null` for everything else — including `''`, `'12abc'`, `'1.2.3'`,
`'1e3'`, `'.5'`, `'12.'`, `'1,23'`, `'Infinity'`, `'12.345'` with 2 digits (too
precise: refuse it rather than round it), any non-string input — and for a
result that is not a safe integer (`Number.isSafeInteger`). Only ASCII digits
count.

The result must be exact for every amount in the safe range, however large.

### `formatAmount(minor, digits = 2)` → string

The inverse, for putting a stored value back into an input: a plain string
with exactly `digits` fraction digits, no grouping, and a leading `-` for
negatives. `1250` → `'12.50'`, `-5` → `'-0.05'`, `1234` with `digits = 0` →
`'1234'`. `parseAmount(formatAmount(n, d), d)` must give back `n`.
