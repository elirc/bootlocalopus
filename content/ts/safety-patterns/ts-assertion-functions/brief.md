```ts
assertDefined(user, 'user');   // throws if user is missing…
sendEmail(user.email);         // …and still: 'user' is possibly 'undefined'
```

A check that throws is only half a guard unless the compiler knows what it
proved. An **assertion signature** tells it: after the call returns normally,
the thing asserted is true, so the code below is narrowed — no `!`, no `as`,
no re-check.

```ts
function assert(condition: unknown, message: string): asserts condition
function assertDefined<T>(value: T, name: string): asserts value is NonNullable<T>
```

They are the right tool for invariants and request validation, where the
failure path is "stop", not "branch".

Traps:

1. **TS2775: "Assertions require every name in the call target to be declared
   with an explicit type annotation."** The compiler only honours an
   assertion signature it can see *without* inferring anything. A function
   declaration is fine. An arrow function in a `const`, or methods on an
   object literal, are not — unless the `const` is annotated with a type that
   spells the signatures out. The same applies at the call site:
   `draft.assertPublishable()` only narrows when `draft` itself has an
   explicit type.
2. An assertion function must return `void`; the narrowing is the result.
3. `asserts this is …` works on methods, narrowing the instance.

## Task

`AssertionError` is in the starter. Export:

- **`assert(condition, message)`** — throws an `AssertionError` when
  `condition` is falsy; narrows by `condition` afterwards.
- **`assertDefined(value, name)`** — throws when `value` is `null` or
  `undefined`; afterwards `value` is its own type minus `null` and
  `undefined` (for `readonly string[] | null`, that is `readonly string[]`).
- **`ensure`** — an object with three assertion methods, callable as
  `ensure.string(x, 'name')` without TS2775 (so declare its type):
  - `string(value: unknown, name)` → `value` is `string`
  - `finiteNumber(value: unknown, name)` → `value` is `number` (throws for
    `NaN` and `Infinity`)
  - `oneOf(value: unknown, allowed, name)` → `value` is the **union of the
    allowed literals**: `ensure.oneOf(role, ['admin', 'member'], 'role')`
    narrows to `'admin' | 'member'` without the caller writing `as const`.
    Allowed values are strings.
- **`Publishable`** — `Draft & { title: string; publishAt: Date }`.
- **`Draft.assertPublishable()`** — throws unless `title` and `publishAt` are
  set; afterwards the instance is `Publishable`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
