```ts
function addLine(cart: Cart, line: Line): Cart {
  cart.lines.push(line); // mutates the cart React is still rendering from
  return cart;           // same reference: the memoised selector never re-runs
}
```

Shared state that is mutated in place is behind a whole family of bugs:
React components that do not re-render, caches whose entries change under
them, config objects one module "adjusts" for everyone. Types can rule the
mutation out — but `Readonly<T>` only goes one level deep. `settings.tags.push`,
`settings.limits.perPage = 50` and `settings.owners.set(…)` all still compile
on a `Readonly<Settings>`.

A deep version has to treat each kind of value differently:

- **arrays and tuples** become `readonly` arrays and tuples (no `push`, no
  index assignment) — a tuple must stay a tuple;
- **`Map` and `Set`** become `ReadonlyMap` and `ReadonlySet`, which have no
  `set`/`add`/`delete`; mapping over a `Map`'s *properties* would keep every
  mutating method;
- **functions** stay callable as they are, and **`Date`** is left as is (its
  setters are a known gap, and wrapping it breaks every API that takes a
  `Date`);
- **plain objects** get `readonly` properties, recursively.

One more gap to know about, which no type fixes: a `Readonly<User>` is still
assignable to a plain `User`, and through that alias it can be mutated. Read-only
types are a strong convention, not a runtime guarantee — `Object.freeze` is
the runtime half.

## Task

Export:

- **`Immutable<T>`** — deeply read-only as described above. Unions are
  handled member by member (`Immutable<string[] | null>` is
  `readonly string[] | null`), primitives are unchanged, and optional
  properties stay optional.
- **`deepFreeze(value)`** — `Object.freeze`s the value and every nested object
  and array, and returns it typed `Immutable<typeof value>`.
- **`totalQty(lines)`** — accepts both a mutable `Line[]` and a frozen cart's
  lines.
- **`addLine(cart, line)`** — accepts a frozen or a plain `Cart`, returns a
  **new** `Immutable<Cart>` with the line appended, and does not touch its
  input.

`Line` and `Cart` are in the starter. `@ts-ignore`, `@ts-expect-error` and
`@ts-nocheck` are not allowed in your file.
