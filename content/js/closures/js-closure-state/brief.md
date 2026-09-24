A closure is a function plus the variables it captured where it was defined.
That capture is the only real privacy JavaScript had before `#fields`, and it is
still how most libraries hide their internals.

## Task

Export `createCounter(start = 0)` returning an object with:

- `increment()` — adds 1, returns the new value
- `decrement()` — subtracts 1, returns the new value
- `value()` — returns the current value

The count must **not** be reachable as a property on the returned object. Two
counters must not share state.