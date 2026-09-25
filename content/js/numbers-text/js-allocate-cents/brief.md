Split a £100.00 bill three ways with `Math.round(10000 / 3)` and you charge
£33.33 three times: £99.99. A penny has vanished, the ledger does not balance,
and finance opens a ticket. Split £0.02 three ways and you charge £0.01 three
times — a penny appeared from nowhere. Every "pro-rata" feature — splitting a
bill, spreading a discount over order lines, refunding part of a bundle — has
this bug until someone writes an **allocator**: a function whose results
always add up to exactly the amount it was given.

The standard method is the **largest remainder**: give every share its exact
value rounded towards zero, then hand the cents that are left over, one each,
to the shares that lost the most in that rounding.

## Task

Export two functions working in integer minor units.

### `allocate(amount, ratios)` → `number[]`

- `amount` is a safe integer (may be negative or zero).
- `ratios` is a non-empty array of non-negative safe integers, at least one of
  them positive; otherwise throw a `RangeError`.
- Return one integer per ratio. The results **always sum to `amount`**.
- Share `i` is `amount × ratios[i] / sum(ratios)`, rounded towards zero, and
  then possibly **one** more unit (away from zero). The leftover units go to the
  shares with the **largest dropped remainder**; on a tie, the **earlier** index
  wins. A ratio of `0` always gets `0`.
- For a negative amount, return the negation of the allocation of its
  absolute value: `allocate(-100, [1, 1, 1])` is `[-34, -33, -33]`. Never
  return `-0`.
- Exact for every safe `amount` (the products can exceed `2**53`).

| call | result |
| --- | --- |
| `allocate(100, [1, 1, 1])` | `[34, 33, 33]` |
| `allocate(5, [3, 7])` | `[2, 3]` (1.5 and 3.5: a tie, the earlier wins) |
| `allocate(1000, [70, 20, 10])` | `[700, 200, 100]` |
| `allocate(10, [1, 0, 2])` | `[3, 0, 7]` (3.33… and 6.66…: the larger remainder, .66…, wins) |

### `splitEvenly(amount, parts)` → `number[]`

`allocate` with `parts` equal ratios. `parts` must be a positive integer
(`RangeError` otherwise).
