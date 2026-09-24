React (and `memo`, and `useMemo`) compares by reference. Mutate state in
place and nothing re-renders; clone the whole tree and everything re-renders.
The right answer is **structural sharing**: copy the path you changed, keep
every other reference identical.

## Task

Export `setIn(obj, path, value)` and `updateIn(obj, path, updater)` where
`path` is an array of keys (strings for objects, numbers for arrays).

Requirements:

- the input is never mutated
- every object **on the path** is a fresh copy
- every branch **off the path** keeps its original reference (this is what the
  tests check hardest)
- arrays stay arrays
- missing intermediate objects are created (a numeric key creates an array)
- `updateIn` calls `updater(currentValue)`, where a missing value is
  `undefined`