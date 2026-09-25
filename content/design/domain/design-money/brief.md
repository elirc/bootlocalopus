`0.1 + 0.2` is `0.30000000000000004`, `parseFloat('0.29') * 100` is
`28.999999999999996`, and `Math.round(-0.5)` is `-0`. Store prices as floats
and each of those turns into a customer who was charged a penny more than the
receipt says, or an accounting export that is off by £3.17 at month end and
takes a day to explain. Mix a `GBP` total with a `USD` refund and nothing
complains at all.

A **Money** value object ends it: an **integer number of minor units** plus a
**currency**, with arithmetic that refuses to mix currencies and rounding
rules written down once.

## Task

`CURRENCIES` (code → number of decimal places) is given. Export
`CurrencyMismatchError` (extends `Error`, `name` `'CurrencyMismatchError'`)
and a `Money` class. Instances are immutable and every operation returns a
new `Money`.

**Creating**

- `Money.of(amountMinor, currency)` — `amountMinor` must be a **safe
  integer** and `currency` an own key of `CURRENCIES`; otherwise throw a
  `RangeError`.
- `Money.zero(currency)`.
- `Money.parse(text, currency)` — decimal text such as `'12.34'`, `'12'`,
  `'-0.50'`: an optional `-`, digits, and optionally `.` plus digits. More
  decimals than the currency has (`'12.345'` GBP, `'500.5'` JPY), or anything
  else (`'1,000'`, `'1e3'`, `'.5'`, `''`), throws a `RangeError`. Convert
  with string arithmetic (pad the fraction, join, `Number(...)`): a bare
  `parseFloat('0.29') * 100` is off by a hair and fails `Number.isSafeInteger`.
- `Money.sum(list, currency)` — the total; `currency` is what an **empty**
  list sums to.

**Reading** — `amountMinor`, `currency`, `toJSON()` →
`{ amountMinor, currency }`, and `toDecimalString()` → exact text with the
currency's decimal places (`1990` GBP → `'19.90'`, `-5` → `'-0.05'`, `500` JPY
→ `'500'`, `7` KWD → `'0.007'`).

**Arithmetic** — `add(other)`, `subtract(other)`, `negate()`,
`times(quantity)` (integer quantities only, else `RangeError`), and
`percentage(basisPoints)` (an integer; 2000 = 20%) which rounds **half away
from zero**: 0.5p → 1p and −0.5p → −1p, so a refund of a discount rounds the
same way as the discount did.

**Comparing** — `compare(other)` → `-1`, `0` or `1`; `equals(other)` (false
for another currency or a non-Money); `isZero()`, `isNegative()`.

`add`, `subtract` and `compare` with a different currency throw
`CurrencyMismatchError`. No result is ever `-0`.

## The traps

- `Math.round(x)` rounds half **up**, towards +∞: `Math.round(-2.5)` is `-2`.
  Round the magnitude and put the sign back, or do the division with integer
  quotient and remainder.
- `-0` sneaks in from `Math.round(-0.4)`, `-0 * 5` and `0 * -1`. It prints as
  `0` but `Object.is(-0, 0)` is false, and some serialisers keep the sign.
  Normalise it in one place: the constructor.
- `CURRENCIES['toString']` is a function. "Is this a currency?" is
  `Object.hasOwn`.
