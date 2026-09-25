The table header says "sort by status, then by newest first". The code says

```js
rows.sort((a, b) => a.status > b.status ? 1 : -1).reverse();
```

and it has four bugs:

1. **It mutates.** `sort` sorts in place, so the array in your store — the one
   React compared by reference — is now a different order under the same
   identity. Use `toSorted` (or copy first).
2. **It never returns 0.** A comparator that says "greater" or "less" for equal
   items is inconsistent, and the engine is free to put ties anywhere.
   `Array.prototype.sort` has been **stable** since ES2019 — equal items keep
   their input order — but only if you tell it they are equal.
3. **`.reverse()` is not descending.** It flips the ties too, and drags the
   rows with no value from the bottom to the top.
4. **The default sort is textual.** `[10, 9, 1].sort()` is `[1, 10, 9]`. And
   `(a, b) => a - b` returns `NaN` when either side is `NaN` or `null`-ish, which
   is an inconsistent comparator again.

## Task

Export `sortBy(items, criteria)`, which returns a **new** array and never
mutates `items`.

`criteria` is an array, most significant first. Each criterion is either a
property name (`'status'`, ascending) or an object `{ key, dir }` where `key`
is a property name or a function `item => value`, and `dir` is `'asc'`
(default) or `'desc'`. Any other `dir` throws a `RangeError`.

Comparison rules for a single criterion:

- **Numbers** compare numerically; **Dates** compare by their time;
  **strings** compare by code unit (`a < b`) — the tests only use lowercase
  ASCII here; the next lesson does text properly.
- **Missing** values — `null`, `undefined` and `NaN` — always sort **after**
  every present value, in **both** directions, and are equal to each other.
- `'desc'` reverses the order of present values only.

Items that are equal on every criterion keep their input order, in both
directions. With an empty `criteria` array, return a copy in the input order.
