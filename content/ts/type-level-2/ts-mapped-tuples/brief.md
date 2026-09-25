A page loader fetches a user, their orders and a count in parallel:

```ts
const [user, orders, count] = await Promise.all([fetchUser(), fetchOrders(), countUnread()]);
```

That is typed well, because `Promise.all` is declared with a mapped tuple type.
The in-house helpers written next to it usually are not: `allObject({ user,
orders })` returns `Record<string, unknown>`, and `runAll(tasks)` returns
`unknown[]`, so every caller casts, and the casts keep compiling after someone
reorders the tasks.

A mapped type over a **tuple** produces a tuple, position by position. That is
the whole trick, and it is how `Promise.all`'s own types work.

## Task

Export these types (the runtime bodies are given; their signatures use the
types):

**`AwaitedValues<T>`**: every value of `T` unwrapped with `Awaited`, keys and
positions kept. `{ user: Promise<User>; n: number }` →
`{ user: User; n: number }`, and `[Promise<1>, 'x']` → `[1, 'x']`.

**`TaskResults<T>`**: `T` is a tuple of **functions**. The result is a
**mutable** tuple of what each one resolves to:
`readonly [() => Promise<User>, () => number]` → `[User, number]`. A plain array
type gives an array (`(() => Promise<number>)[]` → `number[]`).

**`SettledValues<T>`**: every value of `T` as `Settled<Awaited<…>>` (`Settled` is
given), so a caller must check `status` before reading `value`.

Then fix **`runAll`'s signature** so that
`runAll([() => fetchUser(), () => fetchOrders(), () => 42])` resolves to
`[User, Order[], number]` and `runAll([])` to `[]`. Passing promises instead of
functions (`runAll([fetchUser()])`) must not compile.

The spec checks the types with exact equality and destructures real calls.

Two traps:

- A parameter typed `tasks: T` with `T extends (() => unknown)[]` infers an
  **array** from an array literal (`(() => Promise<User> | number)[]`), and
  the positions are gone before your mapped type runs. Write the parameter as
  `readonly [...T]`: the variadic spread asks the compiler to infer a tuple.
- `ReturnType<T[K]>` inside the mapped type does not compile, because the
  checker cannot prove that `T[K]` is a function. Use a conditional with `infer`
  instead.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
