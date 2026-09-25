```ts
const price = new Money(19.99);          // should have gone through fromCents()
price.cents = 0;                         // "immutable" value object
const fake: Money = { cents: 5, plus, equals }; // a Money that never was one
```

A class ported from JavaScript keeps its runtime behaviour and loses every
rule its authors meant it to have: which methods are internal, which
constructor is the only valid way in, which fields never change, which
methods a subclass *must* supply. TypeScript can enforce each of those, but
only if you say so:

- **`abstract`** — a class that exists to be extended, and methods a
  subclass must implement. Forgetting one becomes a compile error on the
  subclass, not a silent no-op at runtime.
- **`protected`** — visible to subclasses, not to callers. **`private`** —
  visible to this class only.
- A **private constructor** plus a **static factory** — the only way in is the
  one that validates.
- **Nominal classes.** TypeScript compares classes structurally, so any object
  with the same public members *is* a `Money`. A class with a `#private`
  field (or a `private` member) is only compatible with its own instances —
  and a private *constructor* alone does not do that.
- **`implements`** — checks the class against an interface where the class is
  written, not at some distant call site.

## Task

Rewrite the starter so that:

**`Repository<T extends Entity>`** is abstract (`new Repository()` is an
error; `T` must have a string `id`).

- `items` (the `Map` storage) is **protected**.
- `validate(item: T): void` is **protected and abstract**: a subclass that
  does not implement it fails to compile.
- `save(item)` validates, stores and returns the item; `find(id)` returns
  `T | undefined`; `all()` returns a **`readonly T[]`** snapshot.
- Remove the `as any` in `save`: the constraint makes `item.id` a string.

**`UserRepository`** extends `Repository<User>`, implements `validate`
(an email without `@` throws), and keeps `findByEmail`.

**`Money`**:

- The constructor is **private**; `Money.fromCents(cents)` is the only way to
  make one (it throws a `RangeError` for a non-integer).
- `cents` is **read-only** from outside (a getter, or a `readonly` property).
- A look-alike object literal must **not** be assignable to `Money`.
- `plus(other: Money): Money` and `equals(other: Money): boolean` stay.

**`FixedClock`** `implements Clock`, and its constructor **requires** the
`Date` it will return.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
