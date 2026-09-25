The checkout's pricing function had forty green tests. Then a customer used
a £10 coupon on a £45 basket plus £10 of extras and got free shipping on a
£45 order, because the free-shipping check read the subtotal **before** the
discount. The week after, a £20 coupon on a £15 basket produced a total of
**−£5**, and the payment provider refunded it. Each of the forty tests sat in
the comfortable middle: one line, no coupon, a basket far from any
threshold.

This boss uses everything in the chapter: boundaries, a table of cases,
error classes and codes, and the promise not to touch the input.

## The function under test

`priceOrder(lines, { coupon } = {})` prices a cart in **integer cents** and
returns `{ subtotal, discount, shipping, total }`.

- `lines` is an array of `{ sku, unitCents, qty }`.
  `subtotal` is the sum of `unitCents * qty`.
- `coupon` is optional:
  - `{ type: 'percent', value }` takes `value` percent off the subtotal,
    **rounded to the nearest cent, halves up** (10% of 1995 is `200`).
  - `{ type: 'fixed', value }` takes `value` cents off, but **never more
    than the subtotal**: the total can't go below the shipping.
  - Either may have `minSpend`: the coupon needs a subtotal of **at least**
    `minSpend` (equal is enough).
- `shipping` is `495`, or `0` when the subtotal **after the discount** is
  **at least** `5000`.
- `total` is `subtotal - discount + shipping`.
- It never changes `lines` or the objects inside it.

Bad input throws an **`OrderError`** (exported as `solution.OrderError`)
with a **`code`**:

| code | when |
| --- | --- |
| `EMPTY` | `lines` is empty |
| `BAD_LINE` | a `qty` that is not a whole number ≥ 1, or a `unitCents` that is not a whole number ≥ 0 |
| `MIN_SPEND` | a coupon's `minSpend` is not met |
| `BAD_COUPON` | a coupon `type` other than `percent` or `fixed` |

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 10 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**: it uses a
  loop and a `switch`, rewords every message and returns the keys in a
  different order. Assert on values and on `code`, never on messages.
- Eight planted bugs must each make at least one of your tests fail.

## The trap

Each rule has a threshold, and each threshold needs a test **on** it and a
test **just past** it: free shipping at exactly 5000 and at 4999, a
`minSpend` met exactly, a fixed coupon worth more than the basket. For free
shipping, pick a basket where the subtotal **before** the discount is over
5000 and the subtotal **after** it is not. Only that input can tell the two
readings of the rule apart.
