Open any old test suite and you will find tests like this: forty lines of
order literal, copied from the test above and edited in one place. Nobody can
see *which* field the test is about. And when the copied order happens to be
invalid in a second way, the test passes for the wrong reason: it expected
`final-sale`, the code said `final-sale` **and** `customer-blocked`, and an
assertion like `toContain('final-sale')` shrugged.

A **test data builder** fixes both problems. One function returns a complete,
**valid** object with sensible defaults, and each test overrides only the
fields it is about:

```js
const order = anOrder({ customer: { blocked: true } });
```

Now every test reads as "a normal order, except…", and exactly one rule is
broken per test, so the result must be exactly one reason.

## What `checkRefund` promises

`checkRefund(order, request)` decides whether a customer may self-serve a
refund for one item. It returns `{ ok, reasons }`, where `reasons` lists
**every** reason that applies, **in this order**, and `ok` is `true` exactly
when `reasons` is empty:

1. `'not-delivered'`: `order.status` is not `'delivered'`.
2. `'window-closed'`: only checked for delivered orders. More than 30 days
   (30 × 24 hours) have passed between `order.deliveredAt` and `request.at`
   (both ISO timestamps). **Exactly** 30 days is still open.
3. `'unknown-item'`: no item in `order.items` has `sku === request.sku`.
4. `'final-sale'`: the **requested** item has `finalSale: true`. Other items
   being final sale does not matter.
5. `'invalid-amount'`: `request.amountCents` is not a positive integer
   (`0` is invalid).
6. `'exceeds-remaining'`: only checked for a valid amount. The amount is more
   than what is left to refund, `order.totalCents - order.refundedCents`.
   Refunding exactly what is left is fine.
7. `'customer-blocked'`: `order.customer.blocked` is `true`.

An order looks like this:

```js
{
  id: 'ord_1', status: 'delivered', deliveredAt: '2024-05-01T12:00:00.000Z',
  totalCents: 5000, refundedCents: 0,
  customer: { id: 'cus_1', blocked: false },
  items: [{ sku: 'MUG', priceCents: 2000, finalSale: false }, …],
}
```

and a request like `{ sku: 'MUG', amountCents: 2000, at: '2024-05-10T09:00:00.000Z' }`.

## Your task

Write a test file against the global `solution` (also available as
`subject`). The starter has one test written the copy-paste way and the
`anOrder` / `aRequest` builders that replace it. Use the builders, and add
to them if you want (an `anItem` builder helps for the final-sale cases).

- Write **at least 7 tests**, each with an assertion.
- The suite must pass against the correct `checkRefund` and against a rewrite
  that evaluates a table of rules instead of `if`s.
- Six planted bugs must each fail at least one of your tests.

## The trap

Assert the **whole** result: `expect(result).toEqual({ ok: false, reasons:
['final-sale'] })`. `toContain` and `ok === false` pass when the code
reports too few reasons or the wrong extra one. And make sure your baseline
really is valid: write one test that the default builder output is `ok`,
because every other test leans on it. A builder whose default order is quietly
invalid makes every "one thing wrong" test mean nothing.

Your builder must build a **fresh** object on every call. If two tests share
and mutate one object, the second test sees the first test's edits.
