Turning on `strict` catches *implicit* `any`. It says nothing about the
explicit ones, and a migrated codebase is full of them: `(rows: any[])` from
the first rename, `catch (e: any)` from a Stack Overflow answer, and the most
dangerous one, `readJson<T = any>(text): T`, a function that *looks* typed
while it hands back whatever the network sent with a `User` label on it.

`any` is **contagious**. `totalCents(lines: any[])` returns `any`, so the
caller's `total` is `any`, and so is everything computed from it. One `any`
in a utility switches off checking in every file that calls it. That is why an
**any audit** (a lint rule like `@typescript-eslint/no-explicit-any`, or a
tool like `type-coverage`) is a standard step after the strict flags are on.

## Task

The starter compiles. Remove every `any` so the spec's checks hold:

- **`readJson(text, guard)`**: takes a `Guard<T>` (a type predicate) and returns
  `T`, throwing a `TypeError` if the parsed value fails the guard. Calling it
  **without** a guard (`readJson<User>(text)`) must not compile: a type
  argument is a claim, not a check. Treat `JSON.parse`'s result as `unknown`.
- **`totalCents(lines)`**: takes `readonly Line[]`, returns `number`.
- **`errorMessage(error)`**: parameter `unknown`, returns `string` (the
  message of an `Error`, otherwise `String(error)`).
- **`pluck(rows, key)`**: generic: `pluck(users, 'name')` is `string[]`, and a
  key that is not in the row type is an error.
- **`createCache<V>()`**: `get(key, now)` returns `V | undefined`, and
  `set(key, value, expiresAt)` only accepts a `V`. Store entries in a
  `Map<string, CacheEntry<V>>`.
- **`isUser(value)`**: parameter `unknown` (a guard that takes `any` checks
  nothing about its own body).

The spec uses `IsAny` on results and parameters, `Equal` on the exact types,
and `@ts-expect-error` for misuse.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
