Tax, commission, discounts and interest are all "an amount times a rate,
rounded". The usual code is

```js
Math.round(amountCents * ratePercent / 100)
```

and it is wrong three ways:

- **`Math.round` rounds halves towards +∞**, not away from zero:
  `Math.round(2.5)` is `3` but `Math.round(-2.5)` is `-2`. A refund of a charge
  rounds differently from the charge itself, and the two no longer cancel.
- **Accountants often need a different rule.** Banks and many tax authorities
  round half to **even** ("banker's rounding"): `12.5 → 12`, `13.5 → 14`. Over
  millions of transactions it does not drift upwards the way always-round-up
  does. Your code should let the caller pick the rule — the same names
  `Intl.NumberFormat`'s `roundingMode` uses.
- **The multiplication is not exact.** Past `2**53` (about 9 × 10¹⁵) a
  `Number` cannot hold every integer, and `amount * rate` in basis points gets
  there with amounts in the hundreds of billions. The product lands on a nearby
  representable value, and whether it was "exactly half" is lost. `BigInt`
  arithmetic is exact at any size.

## Task

Export `applyRate(amount, rateBps, mode = 'halfEven')`.

- `amount` — a safe integer number of minor units (may be negative or zero).
- `rateBps` — the rate in **basis points**, a non-negative safe integer
  (`1` bp = 0.01 %, so 20 % VAT is `2000`, 125 % is `12500`).
- Return `amount × rateBps / 10 000`, rounded to an integer by `mode`, as a
  `Number`:

| mode | rule | `12.5` | `-12.5` | `12.4` | `-12.6` |
| --- | --- | --- | --- | --- | --- |
| `'halfExpand'` | nearest; halves away from zero | 13 | -13 | 12 | -13 |
| `'halfEven'` | nearest; halves to the even neighbour | 12 | -12 | 12 | -13 |
| `'floor'` | towards −∞ | 12 | -13 | 12 | -13 |
| `'ceil'` | towards +∞ | 13 | -12 | 13 | -12 |
| `'trunc'` | towards zero | 12 | -12 | 12 | -12 |

- The result must be **exact**: the correct rounding of the true mathematical
  value, for every safe `amount` and `rateBps`.
- Throw a `RangeError` if `amount` or `rateBps` is not a safe integer, if
  `rateBps` is negative, if `mode` is not one of the five names, or if the
  result is not a safe integer. Never return `-0`.
