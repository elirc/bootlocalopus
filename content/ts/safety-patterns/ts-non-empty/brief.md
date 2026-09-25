```ts
const cheapest = plans.reduce((a, b) => (a.price < b.price ? a : b));
// TypeError: Reduce of empty array with no initial value
Math.max(...scores.map((s) => s.value)); // -Infinity for no scores
invoice.lines[0].currency;               // TypeError: Cannot read properties of undefined
```

Plenty of code is only correct for a non-empty list: "the first line
decides the currency", "pick the best plan", "the group's lead". The type
`T[]` includes `[]`, so each of those functions either returns `undefined`
typed as `T`, or throws — and whether the caller checked is invisible.

A **non-empty tuple type** puts the requirement in the signature:

```ts
type NonEmptyArray<T> = [T, ...T[]]; // one required element, then any number
```

Now `first(items)` can return `T` honestly, the empty case is a compile error
at the call site, and the caller proves non-emptiness exactly once — with a
guard — at the point where the data arrives. Functions that *produce* lists
can promise non-emptiness too: mapping a non-empty list, or grouping items
(every group exists because an item was put in it).

Traps:

- TypeScript does not infer a type predicate from `items.length > 0`; the guard
  needs an explicit `items is …` return type.
- Accept **readonly** non-empty arrays in parameters, so `as const` data and
  frozen lists can be passed; a mutable array narrowed by the guard must stay
  mutable.
- `items.map(fn)` returns `U[]`, forgetting the guarantee. Rebuild the tuple
  from its head and tail, or assert it (`map` never changes the length).

## Task

Export:

- **`NonEmptyArray<T>`** and **`ReadonlyNonEmptyArray<T>`** — at least one
  element; `[]` is not assignable.
- **`isNonEmpty(items)`** — a type guard for any array (mutable or
  readonly). After it, the array is non-empty; a mutable array can still be
  pushed to.
- **`first(items)`**, **`last(items)`** — take a (readonly) non-empty array and
  return `T`. A plain array, readonly array or `[]` literal is a compile error;
  `first(['a', 'b'] as const)` is `'a' | 'b'`.
- **`maxBy(items, score)`** — the item with the highest numeric score (the
  first one wins a tie); takes a non-empty array, returns `T`.
- **`mapNonEmpty(items, fn)`** — `fn(item, index)`; returns
  `NonEmptyArray<U>`.
- **`groupByKey(items, keyOf)`** — any iterable; returns
  `Map<K, NonEmptyArray<T>>`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
