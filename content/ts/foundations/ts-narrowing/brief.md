Data crossing your boundary (`JSON.parse`, `localStorage`, an untyped
library) is `unknown`. Narrowing is how you get from `unknown` to something
usable without lying to the compiler.

This lesson is graded by `tsc --strict`. There are no runtime tests: make the
compiler happy and you are done.

## When you must write `value is T` yourself

Since TypeScript 5.5 the compiler **infers** a type predicate for simple
guards: `(value: unknown) => typeof value === 'string'` is already typed
`value is string`. You do not need to annotate that one.

Inference stops where the proof gets interesting. For a guard that checks an
object's shape, the compiler only infers what it literally saw
(`object & Record<'id', unknown> & …`), never your domain type. Generic guards
like `isNonNull<T>` need a signature to say what `T` is. Those are the ones you
write by hand — and they are exactly the ones at your API boundaries.

## Task

Implement five exports, with no `any`. Do not use `as` either: the compiler
cannot see it in a spec, but a guard built on an assertion is a claim, not a
check.

- `isString(value: unknown)` — a string check (inference is fine here)
- `isUser(value: unknown): value is User` — `User` is exported for you; check
  that `value` is a non-null object whose `id` and `name` are both strings
- `isNonNull<T>(value: T | null | undefined): value is T`
- `hasKey` — `<K extends string>(value: unknown, key: K)` returning a predicate
  that the caller can use to read `value[key]`
- `describe(value: unknown): string` — `"string: hi"`, `"number: 42"`,
  `"array of 3"`, `"object"`, or `"nothing"` for null/undefined

The spec narrows an `unknown` to exactly `User` with `isUser`, and filters an
array with `isNonNull` expecting `string[]`, not `(string | null)[]`.
