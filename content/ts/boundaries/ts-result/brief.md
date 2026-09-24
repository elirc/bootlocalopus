A thrown error is invisible in a type signature. `Result` puts failure in
the return type, so the compiler makes you deal with it.

## Task

Export:

- `ok(value)` — `{ ok: true, value }`
- `err(error)` — `{ ok: false, error }`
- `attempt(fn)` — run `fn`, returning a Result instead of throwing
- `attemptAsync(fn)` — the async version
- `map(result, fn)` — transform the value, pass errors through untouched
- `mapError(result, fn)`
- `unwrapOr(result, fallback)`
- `unwrap(result)` — returns the value or **throws** the error
- `all(results)` — an array of Results becomes a Result of an array,
  short-circuiting on the first error

`map` must not swallow a throw from `fn`: if `fn` throws, the throw
propagates (use `attempt` if you want it captured).