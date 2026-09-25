Someone "fixed" slow product cards by giving `memo` a custom comparator:

```js
memo(ProductCardImpl, (prev, next) => prev.product.id === next.product.id)
```

The re-renders stopped. So did correctness. A comparator that returns `true`
tells React "nothing that matters changed, reuse the last output", so every
prop it ignores is frozen at its first value:

- `inCart` is ignored, so a card never shows that it was added;
- a changed price arrives in a new `product` object with the same `id`, so it
  never appears;
- `onAdd` is ignored, so each card keeps the **first** `onAdd` it was given,
  whose closure saw an empty cart. Add Apple, then Bread, and the cart holds
  only Bread.

The comparator was hiding the real problem: the parent hands every card a new
`onAdd` function and a new `style` object on every render, so the default
comparison could never succeed.

## Task

Fix `Shop` and `ProductCard` so that the shop is **correct**:

- adding products one after another keeps them all (`Cart: 2 items`, …);
- an added card shows `<name> in cart` and is disabled;
- a product object with a new price shows the new price;

and **only then fast**, measured by the `renderLog` (keep its pushes as they
are):

- clicking **Refresh** re-renders no card;
- adding a product re-renders **only that card**, every time, not just the
  first time;
- a new `products` array re-renders only the cards whose product object
  changed.

Keep `ProductCard` wrapped in `memo`, keep its props (`product`, `inCart`,
`onAdd`, `style`) and keep the rendered output the same.

**The trap:** `useCallback((id) => setCart([...cart, id]), [cart])` is
correct, but `cart` changes on every add, so every card gets a new `onAdd`
and re-renders. Find a way for the callback to need no dependencies.
