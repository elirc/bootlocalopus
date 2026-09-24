`processOrder` below works. Every `processOrder` test in this lesson passes
before you change anything — that is deliberate. Refactoring means changing
structure while behaviour stays identical, and those tests are what prove it.
The other tests describe the pieces you are about to extract.

There is **one deliberate extension**, and it is the only behaviour change
allowed: the hardcoded free-shipping threshold becomes configurable as
`config.freeShippingThresholdCents`, defaulting to the old `5000`, so every
existing caller sees identical results. Real refactors often ride along with a
small, named change like this; the discipline is keeping it named and small.

What is wrong with it: one function does five jobs, the money maths is
duplicated, a magic number is buried in a branch, and the whole thing is
untestable in pieces.

## Task

Keep `processOrder(order, config)` working exactly as it does now, and
additionally export these pure functions, each doing one job:

- `subtotalCents(items)` — sum of `quantity * unitCents`
- `discountCents(subtotal, config)` — the discount, applying
  `config.discountPercent` and honouring `config.maxDiscountCents`
- `shippingCents(subtotal, config)` — `config.shippingCents`, or `0` when the
  subtotal reaches `config.freeShippingThresholdCents`
- `taxCents(taxable, config)` — `config.taxPercent` of the taxable amount
- `validateOrder(order)` — returns an array of problem strings (empty when
  valid)

`processOrder` must then be a short composition of those. All money is integer
cents, and every intermediate is rounded with `Math.round` at the point the
original code rounds.