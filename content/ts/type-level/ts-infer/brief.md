`infer` declares a type variable inside a conditional type: "if T looks like
this shape, capture that part and call it E".

## Task

Rebuild these from scratch (no built-in `ReturnType`, `Parameters`, or
`Awaited`):

- `MyReturnType<F>`
- `MyParameters<F>` — as a tuple
- `FirstParam<F>`
- `ElementOf<T>` — the element type of an array
- `MyAwaited<T>` — unwraps nested promises all the way down
- `Last<T>` — the last element type of a tuple

Each must resolve to `never` for inputs of the wrong shape (except
`MyAwaited`, which passes non-promises through unchanged).