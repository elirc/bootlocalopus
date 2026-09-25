A customer buys two coats and three pairs of socks with a £10 voucher and
pays £3.99 shipping. Over the next month they return one coat, then two pairs
of socks, then everything else. Each refund is computed on the spot as
"unit price × quantity × (1 − discount ÷ subtotal)", rounded. Add the refunds
up and the customer got back £128.95 of the £128.97 they paid — or £129.01,
depending on the order they returned things in. Finance finds it at month end.
Support cannot say why the second refund was £9.26 and not £9.27.

This boss is the chapter at once: money in **minor units**, **allocation**
that never loses a penny, an **aggregate** that enforces refund rules, and an
**event-sourced** history that can explain every number.

The key idea: **decide the price of every unit once, when the order is
placed**, and have refunds hand back those exact unit amounts. Then
"refund everything" returns exactly what was paid, whatever the order.

## Task

Export `REFUND_WINDOW_DAYS` (30), `DomainError` (`name` `'DomainError'`, a
`code`), and these pure functions:

**`allocate(total, ratios)`** — the largest-remainder allocation from earlier
in the chapter (non-negative totals are enough here; all-zero ratios give all
zeros).

**`decide(state, command)`** → an array of events, or throws a `DomainError`.

*`{ type: 'PlaceOrder', orderId, currency, placedAt, lines, discountMinor = 0, shippingMinor = 0 }`*,
`lines` being `{ sku, unitPriceMinor, quantity, finalSale? }`:

- Already placed → `ALREADY_PLACED`. No lines, a duplicate SKU, a quantity
  that is not a positive integer, a price or shipping that is not a
  non-negative integer → `INVALID_ORDER`. A discount that is negative,
  non-integer or larger than the sum of `unitPriceMinor × quantity` →
  `INVALID_DISCOUNT`.
- Emits `{ type: 'OrderPlaced', orderId, currency, placedAt, discountMinor, shippingMinor, lines }`
  with each line as `{ sku, unitPriceMinor, quantity, finalSale }`
  (`finalSale` defaulting to `false`).

*`{ type: 'RequestRefund', refundId, items: [{ sku, quantity }], at }`* —
checked in this order:

1. Not placed → `NOT_PLACED`.
2. `refundId` already used: the same items (same SKUs and quantities, same
   order) → `[]` (a retry, even after the window has closed); different
   items → `REFUND_ID_REUSED`.
3. No items → `EMPTY_REFUND`.
4. `at` more than `REFUND_WINDOW_DAYS` days after `placedAt` (ISO strings;
   exactly 30 days is still open) → `WINDOW_CLOSED`.
5. For each item, in order: unknown SKU → `UNKNOWN_SKU`; SKU listed twice →
   `INVALID_REQUEST`; quantity not a positive integer → `INVALID_QUANTITY`;
   a `finalSale` line → `FINAL_SALE`; more than the line has left to refund →
   `EXCEEDS_REFUNDABLE`. Any failure rejects the whole request.
6. Emits `{ type: 'RefundIssued', refundId, items, shippingMinor, totalMinor }`,
   `items` as `{ sku, quantity, amountMinor }` in request order,
   `totalMinor` = item amounts + `shippingMinor`.

**The pricing rules** (this is what makes it add up):

- A line's gross is `unitPriceMinor × quantity`. The order discount is
  **allocated over lines in proportion to their gross**; a line's net is
  gross − its share. Paid = sum of line nets + shipping.
- Each line's net is **allocated over its units** (equal ratios), so a £29.00
  line of 3 has unit amounts `[967, 967, 966]`.
- Refunding `k` units of a line that already refunded `r` returns units
  `r … r+k−1` of that list — the first refund gets the first amounts.
- Shipping is refunded with the refund that leaves **no unit of any line**
  unrefunded (so never while a final-sale line remains), exactly once.
  Otherwise `shippingMinor` is `0`.

**`evolve(state, event)`** — pure, never mutates `state`; `rehydrate(events)`
is `events.reduce(evolve, null)`. The state shape is yours.

**`summarize(state)`** → `{ orderId, currency, paidMinor, refundedMinor, lines }`,
`lines` as `{ sku, quantity, refundedQuantity, netMinor }` in order.

## The traps

- Pro-rating a refund with a fresh `Math.round` every time is the bug in the
  first paragraph. Allocate once, at placement, and store nothing you can
  recompute from the `OrderPlaced` event.
- Allocating the discount by **unit price** instead of **line gross** gives a
  two-coat line the same share as a one-sock line.
- "Is this the last unit?" must count this request's items too, including a
  single request that refunds everything.
