A `Map` keyed by `[userId, day]` does not work: arrays are compared by
identity, so `map.get([7, '2025-03-01'])` builds a new array and always misses.
The usual patch is to turn the tuple into a string, and every way of doing that
has a collision somebody will eventually hit:

| key builder | collides |
| --- | --- |
| `parts.join(',')` | `['a,b']` with `['a', 'b']`; `[1]` with `['1']` |
| `` `${a}${b}` `` | `['ab', 'c']` with `['a', 'bc']` |
| `JSON.stringify(parts)` | `[NaN]` with `[null]`; `[undefined]` with `[null]`; every `{ id: 1 }` object with every other one |

Collisions in a cache key are the worst kind of bug: the wrong user's data,
served quickly.

## Task

Export a class `TupleMap` — a map whose keys are **arrays**, compared element by
element the way a `Map` compares keys (SameValueZero: `NaN` equals `NaN`,
`0` equals `-0`, `1` does not equal `'1'`, objects by identity):

- `set(key, value)` — returns the map. Overwriting an existing key keeps its
  original position in iteration order.
- `get(key)`, `has(key)`, `delete(key)` (returns `true` if something was
  removed), `get size`.
- `entries()` — an array of `[key, value]` pairs in insertion order.

Rules the grader checks:

- Keys of different length are different: `[1]`, `[1, undefined]` and `[]` are
  three keys (`[]` is a valid key).
- The map must not be affected if the caller **mutates their key array** after
  `set`: store a copy.
- Values can be anything, including `undefined` (`has` still reports it).

Hint at a design: a Map of Maps — one level per tuple position — needs no
encoding at all, and gets SameValueZero and object identity for free.
