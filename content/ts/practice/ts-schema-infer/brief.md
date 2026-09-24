Every codebase that validates its inputs eventually has this:

```ts
const UserSchema = object({ id: number(), nickname: optional(string()), tags: arrayOf(string()) });
interface User { id: number; nickname?: string; tags: string[] }   // keep in sync!
```

Nobody keeps it in sync. Someone adds `email` to the schema and not the
interface, and the compiler happily lets the rest of the app ignore it. Zod,
Valibot and ArkType exist largely so the type is **derived** from the schema:
`type User = z.infer<typeof UserSchema>`. This lesson builds that derivation.

The runtime code in the starter already works. Only the types are wrong.

## Task

Keep these exports and make their types precise:

- `Schema<T>` — an object with `parse(value: unknown): T`. Every builder
  returns something assignable to `Schema<T>` for the right `T`.
- `string()` → `Schema<string>`, `number()` → `Schema<number>` (already done).
- `optional(schema)` — parses to `T | undefined`, **and** is recognisably
  optional at the type level, so `object()` can turn its key into `key?: T`.
  How you mark it is up to you (an extra property on the returned object is the
  usual trick).
- `arrayOf(schema)` → `Schema<T[]>`, nesting freely (`arrayOf(arrayOf(number()))`
  is `number[][]`).
- `object(shape)` — `shape` is a record of schemas; the result parses to an
  object type with one key per shape key. Keys whose schema is `optional(...)`
  become **optional properties** (`nickname?: string`, not
  `nickname: string | undefined`); every other key is required.
- `Infer<S>` — the type a schema parses to.

The spec checks with **exact** type equality, for example

```ts
const User = object({ id: number(), nickname: optional(string()), tags: arrayOf(string()) });
type _ = Expect<Equal<Infer<typeof User>, { id: number; nickname?: string; tags: string[] }>>;
```

plus nested objects, arrays of objects, optional objects, an all-optional
shape and an empty shape (`{}`). `User.parse(x)` must return
`Infer<typeof User>`. And misuse must not compile: `object({ id: 5 })`,
`arrayOf(string)` (the factory, not a schema), `optional('nickname')`.

The trap: `Equal` is strict. `{ id: number } & { nickname?: string }` means the
same thing as `{ id: number; nickname?: string }` but is not *identical* to
it, so the check fails. Flatten your result with a mapped type.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
