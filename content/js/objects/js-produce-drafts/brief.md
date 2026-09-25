Immutable updates by hand are correct and miserable:

```js
return { ...state, cart: { ...state.cart, items: state.cart.items.map((i) =>
  i.sku === sku ? { ...i, qty: i.qty + 1 } : i) } };
```

Immer (built into Redux Toolkit) lets you write the mutation you meant —
`draft.cart.items.find((i) => i.sku === sku).qty++` — and gives you back a new
state with **structural sharing**: only the objects on a changed path are
copied, everything else keeps its identity. It does it with a `Proxy` per
object you touch, a **copy-on-write** shallow copy made on the first write,
and a finalise pass that swaps drafts for real values. You are building the
core of it.

## Task

Export `produce(base, recipe)`. `base` is a plain object or an array (throw a
`TypeError` otherwise). `recipe(draft)` mutates `draft` freely; its return
value is ignored. `produce` returns the next state:

1. **`base` is never mutated**, at any depth.
2. If the recipe changed nothing, `produce` returns **`base` itself**. Reading
   values, or assigning a value that is already there (`Object.is`), is not a
   change.
3. **Structural sharing.** Every object or array on the path to a change is a
   new shallow copy; everything else in the result is the **same reference**
   as in `base`. An object whose children did not change keeps its identity.
4. Nested plain objects and arrays read from a draft are drafts too, and
   reading the same property twice gives the same draft (`draft.user ===
   draft.user`). `Date`, `Map`, class instances and primitives are returned
   as they are, not drafted.
5. Everything works on array drafts: index assignment, `push`, `pop`,
   `splice`, `shift`, `sort`, `length = 0`, `filter`/`map`/`find` reads.
   The result keeps arrays as arrays.
6. `delete draft.key`, `key in draft`, `Object.keys(draft)` and
   `JSON.stringify(draft)` see the draft's current state during the recipe.
7. **No proxies in the result.** A draft that ends up somewhere else in the
   tree (`draft.backup = draft.user`, `draft.items = draft.items.filter(…)`,
   `draft.list = [draft.user]`) is replaced by its final value — the original
   object if it was not changed.
8. **Drafts die with the recipe.** After `produce` returns (or throws), using a
   draft that leaked out of the recipe throws a `TypeError`. `Proxy.revocable`
   does this.
9. If the recipe throws, `produce` rethrows that error.

Keep a per-draft state record — `{ base, copy, modified, parent, … }` — in a
`WeakMap` keyed by the proxy. Reads come from `copy ?? base`; the first write
makes `copy`, and marks this draft and every ancestor as modified.
