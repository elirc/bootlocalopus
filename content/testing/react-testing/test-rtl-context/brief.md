The cart badge said "3 items" for a cart of three mugs **and** for a cart
of one mug, one pen and one bag with a quantity of five. Every component
test rendered `<CartSummary items={[…]} />` with hand-made props. Nobody
tested the path a real user takes: click **Add to cart**, and the summary
updates through the shared context. Nobody tested the saved cart either,
which was never loaded again after a page refresh.

When components talk through **context**, test them **together inside the
real provider**, the way the app composes them. Replace only what you can't
use in a test (here, `localStorage`) with a small fake you pass in.

## The components under test

- `<CartProvider storage?>`: holds the cart. `storage` is anything with
  `getItem(key)` and `setItem(key, value)`. On mount it loads the JSON
  array saved under the key **`'cart'`** (if there is one). After every
  change, `storage` holds the current items under `'cart'` as JSON:
  `[{ id, name, priceCents, qty }]`.
- `useCart()` returns `{ items, add, remove }`. Used **outside** a
  `CartProvider`, it **throws** an `Error`.
- `<AddToCartButton product={{ id, name, priceCents }} />`: a button named
  **`Add <name> to cart`**. Adding a product that is already in the cart
  **increases its `qty`**. It does not add a second line.
- `<CartSummary />` shows:
  - `data-testid="cart-count"`: the total **quantity**, as `1 item` or
    `<n> items` (`0 items` when empty);
  - one list entry per line, with a button named **`Remove <name>`** that
    removes **that** line;
  - `data-testid="cart-total"`: the sum of `priceCents × qty`, as pounds
    (`£12.50`);
  - `data-testid="shipping"`: `Free shipping!` when the total is **at
    least £50.00**, otherwise `Spend £X more for free shipping`.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`). Render the
real components together, e.g.
`<solution.CartProvider storage={fake}><solution.AddToCartButton … /><solution.CartSummary /></solution.CartProvider>`.

- Write **at least 8 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but uses a
  reducer, a `<table>` and a different error message. Use the button
  names and the `data-testid`s from the contract.
- Nine planted bugs must each make at least one of your tests fail.

## The trap

Every "count" bug and "total" bug hides when each product is added exactly
**once**. Add the same product twice. For storage, test **both**
directions: something saved before mount shows up, and a change made in
the UI ends up in storage.
