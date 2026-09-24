A custom hook is just a function calling other hooks. The value is in
packaging a *behaviour* — with its cleanup — so call sites stay boring.

## Task

Export three hooks:

- `useToggle(initial = false)` — returns `[on, toggle, set]`. `toggle` takes no
  arguments and must be **referentially stable** across renders.
- `useCounter(start = 0, { min, max } = {})` — returns
  `{ count, inc, dec, reset }`, clamped to the bounds when given.
- `useDebouncedValue(value, delay)` — returns the value, but only after it has
  stopped changing for `delay` ms. Must clear its pending timer on change and
  on unmount (no "update after unmount" leaks).

All callbacks must be stable — a new function identity every render defeats
`memo` downstream.