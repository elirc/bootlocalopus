Split £10.00 between three people with `Math.round(1000 / 3)` and you charge
£3.33 three times: £9.99. A penny has vanished, and the payment provider
rejects the batch because the parts do not add up to the order. Spread a £1
voucher over three order lines the same way and a later partial refund of
one line refunds a discount that was never given. Money **cannot be divided
by multiplication and rounding**; it has to be **allocated**.

The standard method (Fowler's `allocate`, the **largest-remainder method**):

1. Give each part the **floor** of its exact share.
2. Count what is left over (always fewer units than there are parts).
3. Hand those units out one at a time to the parts with the **largest
   fractional remainder**, breaking ties towards the earlier part.

The parts always add up to the total, and no part is more than one unit away
from its exact share.

## Task

All amounts are integers in minor units. Export:

**`allocate(totalMinor, ratios)`** → an array of integers, one per ratio,
summing to exactly `totalMinor`, using the method above.

- `ratios` are non-negative **integers**, at least one of them positive. A
  zero ratio gets `0`.
- A **negative** total (a refund) is allocated as the mirror image of the
  positive one: `allocate(-1000, [1, 1, 1])` is `[-334, -333, -333]`.
- Throw a `RangeError` for a non-integer total, an empty or non-array
  `ratios`, a negative or non-integer ratio, or all-zero ratios.
- No part is ever `-0`. Do not modify `ratios`.

**`splitEvenly(totalMinor, n)`** → `allocate` with `n` equal ratios.
`splitEvenly(2000, 3)` is `[667, 667, 666]`. `n` must be a positive integer
(`RangeError`).

**`distributeDiscount(lines, discountMinor)`** — `lines` are
`{ sku, amountMinor, … }`. Allocate the discount in proportion to each line's
`amountMinor` and return **new** line objects with every original field plus
`discountMinor` and `netMinor` (`amountMinor - discountMinor`). A discount of
`0` gives every line `0` (even when every line is free). A negative discount,
or one larger than the sum of the lines, throws a `RangeError`.

## The traps

- "Give the leftover to the last part" adds up but is unfair and fails
  `allocate(10, [3, 1, 3])`, which must be `[4, 2, 4]`: the middle part's
  exact share (1.43) has the largest remainder.
- Compute remainders with **integers**: `total * ratio % ratioSum`. Comparing
  float fractions like `4.285714… - 4` can mis-order two equal remainders.
- `Math.floor(-3.33)` is `-4`. Allocate the absolute value, then restore the
  sign.
