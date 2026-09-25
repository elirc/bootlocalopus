```ts
const app = container()
  .provide('db', () => new Db(url))
  .provide('users', (deps) => new UserRepo(deps.db as Db)) // a cast per dependency
  .build();
(app.users as UserRepo).find(id);                           // and another per use
```

A dependency container that returns `Record<string, unknown>` pushes a cast
into every factory and every consumer — and a cast is exactly where a renamed
or unregistered dependency slips through to runtime. A **typed builder**
records its state in a type parameter instead: each call returns a builder
whose type knows one more thing. Query builders, router builders, form
builders and test-data builders all work this way.

```ts
container()                       // Container<{}>
  .value('config', config)        // Container<{ config: Config }>
  .provide('db', ({ config }) => new Db(config.dbUrl))
                                  // Container<{ config: Config; db: Db }>
```

Because a factory only sees the dependencies registered **before** it, the
types also rule out use-before-provide and cycles.

Traps you will meet:

1. `D & { db: Db }` is correct but it is an intersection; after five calls it
   prints as five, and it is not *identical* to the flat object type. Flatten
   it at each step with the usual `Simplify` mapped type.
2. A duplicate name must be an error, not a silent overwrite. A name typed as a
   plain `string` must be rejected too: `D & { [x: string]: V }` swallows every
   precise name that came before.
3. The builder must be **immutable**: registering on `base` returns a new
   container and leaves `base` (and its type) untouched, so a test can branch
   from a shared base.

## Task

Export:

- **`Container<D>`** — a class (or an interface plus a factory) where `D` is
  the dependency map so far. Methods:
  - `provide(name, factory)` — `factory` receives the dependencies registered
    so far (typed from `D`, no annotations needed at the call site) and returns
    the value. Returns `Container<…D plus { [name]: that value's type }…>`,
    **flattened**.
  - `value(name, value)` — the same, for a ready-made value.
  - `override(name, make)` — `name` must already be registered; `make` takes
    no arguments and must return a value of that dependency's type (a test
    fake). Returns `Container<D>`.
  - `build()` — instantiates every dependency once, in registration order,
    each factory receiving the already-built ones, and returns them typed `D`.
- **`container()`** — returns an empty `Container<{}>`.
- **`Deps<C>`** — the dependency map of a container type:
  `Deps<typeof base>` is `{ config: Config; db: Db; … }`.

For `provide` and `value`, `name` must be a string literal not already in `D`.
The spec checks that `typeof base` is exactly `Container<{ … }>` with the
flat map, and that `build()` returns exactly that map.

Storing factories in an array means erasing their types at the boundary of
the array; a single cast when storing and one in `build` are fine. The
public signatures are what callers see, and those have no `any`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
