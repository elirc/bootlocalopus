Most "the frontend is slow" bugs are a nested loop doing
`list.find(...)` inside a `map`. Indexing the data once turns O(n·m) into
O(n + m).

## Task

Export:

- `groupBy(items, key)` — `key` is a function or a property name. Returns a
  plain object of arrays, preserving input order within each group.
- `keyBy(items, key)` — one item per key; **last one wins**.
- `countBy(items, key)` — counts per key.

All three must handle an empty list, and must not crash on a key function that
returns `undefined` (bucket it under the string `"undefined"`).

The keys come from data, and data contains `"constructor"`, `"toString"` and
`"__proto__"`. On a `{}` those names already mean something: `out["constructor"]`
is `Object`, and assigning `out["__proto__"]` swaps the prototype instead of
adding a key. Build the results on `Object.create(null)` so every key is just a key.

In production on Node 21+ you would reach for the built-ins, which do exactly
that: `Object.groupBy(items, fn)` returns a null-prototype object, and
`Map.groupBy` returns a `Map`. Write them yourself here so you know what they do.