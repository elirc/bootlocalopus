The order is a plain object, and five places change it: the cart API pushes
lines, the promotions service sets `order.discount`, the admin tool edits
quantities, checkout flips `status`. Each re-checks some of the rules. So an
order goes out with 40 of an item limited to 10, a £15 voucher on a £9 order
(total: −£6), and a line added to an order that was already placed and paid
for.

An **aggregate** is a cluster of objects (an order and its lines) that is only
ever changed through its **root**, and the root enforces the rules — the
**invariants** — on every change. Nobody else can reach the lines, so nobody
else can break them. And because every method checks first and mutates
second, a rejected command leaves the order exactly as it was.

## Task

Export `MAX_QUANTITY` (10), `MAX_LINES` (20), `DomainError` (extends `Error`,
`name` `'DomainError'`, with a string `code`) and `class Order`,
`new Order(id)`. Every rule violation throws a `DomainError` with the code
shown, and **changes nothing**.

**Lines** (only while `status` is `'draft'`, else `INVALID_STATUS`):

- `addItem(sku, unitPriceMinor, quantity)` — `quantity` a positive integer
  (`INVALID_QUANTITY`), price a non-negative integer (`INVALID_PRICE`). An SKU
  already in the order is **merged** into its line: a different unit price is
  `PRICE_MISMATCH`, and the merged quantity may not exceed `MAX_QUANTITY`
  (`QUANTITY_LIMIT`). A new line is limited to `MAX_QUANTITY`
  (`QUANTITY_LIMIT`), and the order to `MAX_LINES` distinct lines
  (`TOO_MANY_LINES`). Lines keep the order they were first added in.
- `changeQuantity(sku, quantity)` — unknown SKU is `UNKNOWN_LINE`; `0` removes
  the line; otherwise a positive integer (`INVALID_QUANTITY`) up to
  `MAX_QUANTITY` (`QUANTITY_LIMIT`).

**Coupons** (draft only):

- `applyCoupon({ code, percentOff, amountOffMinor, minSubtotalMinor = 0 })` —
  exactly one of `percentOff` (an integer 1–100) or `amountOffMinor` (a
  positive integer), else `INVALID_COUPON`. If the subtotal is below
  `minSubtotalMinor`, `COUPON_MINIMUM`. Replaces any current coupon.
- `removeCoupon()`.
- If a line change takes the subtotal **below** the coupon's
  `minSubtotalMinor`, the coupon is removed.

**Totals** — `totals()` returns `{ subtotalMinor, discountMinor, totalMinor }`.
A percentage discount is `Math.round(subtotal * percentOff / 100)`. The
discount is capped at the subtotal, **always** — including after lines are
removed — so the total is never negative.

**Lifecycle** — `place(at)`: draft only (`INVALID_STATUS`), at least one line
(`EMPTY_ORDER`); sets `status: 'placed'` and `placedAt: at`. `cancel()`: from
`'draft'` or `'placed'`; cancelling twice is `INVALID_STATUS`.

**Reading** — `snapshot()` returns
`{ id, status, lines, coupon, placedAt, subtotalMinor, discountMinor, totalMinor }`,
where `lines` are `{ sku, unitPriceMinor, quantity }`, `coupon` is `null` or
what was applied (including `minSubtotalMinor`), and `placedAt` is `null`
until placed. It is a **copy**: changing it changes nothing in the order.

## The traps

- Checking the merged quantity *after* adding it leaves the line at 12 when
  the call throws. Validate everything, then mutate.
- Storing `discountMinor` when the coupon is applied goes stale the moment a
  line is removed. Derive totals from the current lines every time.
- `return this.#lines` from `snapshot()` hands out the aggregate's insides.
