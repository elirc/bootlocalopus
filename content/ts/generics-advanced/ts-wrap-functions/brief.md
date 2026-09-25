```ts
const getUser = withLogging('getUser', fetchUser, log);
getUser(42, 'yes please'); // compiles: getUser is (...args: any[]) => any
```

Every codebase has a folder of wrappers — logging, retry, memoise, `once`,
bind-the-db-handle — and each one typed `(fn: Function)` or
`(...args: any[]) => any` is a hole: whatever passes through comes out
untyped, and every caller downstream loses autocomplete and checking.

The fix is to capture the wrapped function's **parameter list as a tuple**
and its **result** as separate type parameters, then spread the tuple back
out:

```ts
function wrap<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
```

That keeps parameter names, optional parameters and arity. It also lets
TypeScript carry a **generic** function's own type parameter through the
wrapper (`once(<T>(x: T) => x)` stays generic), which the
`F extends (...args: any[]) => any` + `Parameters<F>` / `ReturnType<F>`
version cannot — it resolves `T` to `unknown`.

## Task

Export, each returning a function with **exactly** the wrapped signature:

- `withLogging(name, fn, log)` — calls ``log(`${name}(${n} args)`)`` then
  returns `fn(...args)`.
- `once(fn)` — calls `fn` the first time and returns that result forever
  after. `once(<T>(value: T) => value)` must still return a `number` when
  called with `42`.
- `partial(fn, first)` — binds the first argument: `partial(query, db)` where
  `query(db: Db, sql: string, params?: unknown[])` gives
  `(sql: string, params?: unknown[]) => Promise<Row[]>`. A `first` of the wrong
  type is a compile error.
- `memoizeAsync(fn, key)` — `fn` must return a `Promise`; `key` receives the
  same arguments and must return a `string`. Equal keys share one promise; a
  rejected promise is dropped from the cache so the next call retries.

### The trap in `memoizeAsync`

A key function usually ignores trailing optional parameters:
`memoizeAsync(fetchUser, (id) => id)`. But `key`'s parameters are an
inference site for the parameter tuple too, and it votes for the *shorter*
list — the wrapper silently loses `fetchUser`'s optional `opts` parameter. The
spec checks that the wrapper keeps it, and that `id` is still inferred as
`string` inside the key function. You met the fix in the `NoInfer` lesson;
wrap the **whole function type** of `key`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
