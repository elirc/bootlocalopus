You are about to refactor `processOrder`, the monolith from the
**Refactoring under test** lesson. It has no tests. If you split it into small
functions now, you can only tell whether behaviour changed by reading the diff
very carefully. That is how a rounding step moves and a total comes out one
cent different for a small share of orders. You find out a month later, from
a finance reconciliation.

The fix is to write **characterisation tests** first. They record what the
code *does* today, including anything odd, not what you think it should do.
If the current behaviour looks wrong, pin it anyway and raise it separately.
A refactor must not change behaviour, even to fix a bug.

## The code you are characterising

```js
export function processOrder(order, config) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return { ok: false, problems: ['order must have at least one item'] };
  }
  const problems = [];
  for (const item of order.items) {
    if (!item.sku) problems.push('item missing sku');
    if (!(item.quantity > 0)) problems.push('quantity must be positive');
    if (!(item.unitCents > 0)) problems.push('unitCents must be positive');
  }
  if (problems.length) return { ok: false, problems };

  let subtotal = 0;
  for (const item of order.items) subtotal = subtotal + item.quantity * item.unitCents;

  let discount = 0;
  if (config.discountPercent) {
    discount = Math.round(subtotal * (config.discountPercent / 100));
    if (config.maxDiscountCents && discount > config.maxDiscountCents) discount = config.maxDiscountCents;
  }

  let shipping = config.shippingCents || 0;
  if (subtotal - discount >= 5000) shipping = 0;

  const tax = Math.round((subtotal - discount + shipping) * (config.taxPercent / 100));

  return { ok: true, problems: [], subtotalCents: subtotal, discountCents: discount,
    shippingCents: shipping, taxCents: tax, totalCents: subtotal - discount + shipping + tax };
}
```

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`) and pins this behaviour:
`solution.processOrder(order, config)`.

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against the **refactored version**: the same function
  broken into `validateOrder`, `subtotalCents`, `discountCents`,
  `shippingCents` and `taxCents`. So call `processOrder` and assert on the
  object it **returns**. Do not call those helpers: the original code does not
  have them, and a characterisation test must pass *before* the refactor.
- Five refactoring slips are planted. Each one must make at least one of your
  tests fail.

## The trap

Round numbers hide everything. With a subtotal of `10000` and a 10 % discount,
it makes no difference *where* the rounding happens. The same goes for an
order far above the free-shipping line: it does not matter which amount is
compared with `5000`. Choose inputs that sit on the edges: a discount that
comes out fractional, an order that is over `5000` before the discount and
under it after, a cap that is lower than the raw discount *and* one that is
higher, and an order with more than one problem, **across more than one
item**.

A practical way to work: call the function, `console.log` the result (the log
from the correct version appears in the output), check it by hand, then paste
it into `toEqual`. Snapshotting the whole return object is fine here. The
point is to spot any change.
