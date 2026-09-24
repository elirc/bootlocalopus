`{ loading: boolean; data?: User; error?: string }` allows
`loading: true` *with* an error *and* data — four booleans of nonsense. A
discriminated union allows only the states that exist.

The prize: add a new state and every `switch` that forgot to handle it fails to
compile.

## Task

Define and export:

- `RequestState<T>` — a union of exactly four members discriminated by a
  `status` field: `'idle'`, `'loading'`, `'success'` (with `data: T`), and
  `'error'` (with `error: Error`). Only the success member may have `data`;
  only the error member may have `error`.
- `render<T>(state: RequestState<T>): string` — `'idle'`, `'spinner'`,
  `'data'`, `'error: <message>'`.
- `assertNever(value: never): never` — throws. Call it in `render`'s default
  branch so a fifth state becomes a compile error.