```ts
const add = (sku: string, qty: number) => ({ type: 'cart/add', sku, qty });
//    ^? (sku, qty) => { type: string; sku: string; qty: number }
```

A string literal inside an object literal **widens**: `type` becomes `string`.
Do that to every action creator and the "union" of actions has no
discriminant — `switch (action.type)` narrows nothing, so the reducer ends up
taking `any`, and a typo in `'cart/remvoe'` is a silently ignored action.

The fix is small, and the payoff is large: keep the discriminant literal
(`'cart/add' as const`, or `as const` on the whole returned object), then
**derive** the action union from the creators instead of writing it twice:

```ts
type CartAction = ReturnType<(typeof cartActions)[keyof typeof cartActions]>;
```

Indexing an object type with the union of its keys gives the union of its
values, and `ReturnType` distributes over that union of functions. Add a
creator and the union, the reducer's parameter and every exhaustive `switch`
follow.

## Task

Export:

- **`ActionsOf<M>`** — for any object of action creators, the union of the
  actions they return. `ActionsOf<typeof cartActions>` is `CartAction`.
- **`cartActions`** — `add(sku, qty)`, `remove(sku)`, `clear()`, returning
  `{ type: 'cart/add', sku, qty }`, `{ type: 'cart/remove', sku }` and
  `{ type: 'cart/clear' }`, with literal `type`s.
- **`CartAction`** — `ActionsOf<typeof cartActions>`.
- **`CartState`** — `{ lines }` of `{ sku, qty }` lines. It is **immutable**:
  `state.lines.push(…)` must be a compile error (the reducer returns new
  arrays; it never mutates).
- **`cartReducer(state: CartState, action: CartAction): CartState`** —
  `add` appends a line or increases an existing line's `qty`; `remove` drops
  that sku; `clear` empties the cart. End the `switch` with an exhaustiveness
  check so a new action that is not handled fails to compile.
- **`bindActions(creators, dispatch)`** — returns an object with the same keys
  where each function takes the creator's parameters, calls it, dispatches the
  result and returns `void`. `dispatch` must accept `ActionsOf<typeof creators>`;
  a dispatcher for some other action type is a compile error.

The spec compares parameter lists and discriminants, not the exact object
types, so either placement of `as const` passes. Inside `bindActions`,
the checker cannot follow a loop over keys: an assertion on the accumulator
(and one on the created action) is expected. The public signature is what
callers see.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
