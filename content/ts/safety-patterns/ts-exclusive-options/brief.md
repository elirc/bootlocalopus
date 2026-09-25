```ts
type UserQuery = { id: string } | { email: string };
findUser({ id: 'u1', email: 'someone-else@example.com' }); // compiles
```

Options objects are full of rules the type does not state: "look up by id
**or** email", "run once **or** on a schedule", "give us an email or a phone,
at least one", "pay with exactly one method". The obvious union does not
enforce the first: an object literal only needs to match *one* member of a
union, and the excess-property check is lenient across union members, so an
object with both keys compiles. Which one the implementation reads first
decides which user you delete.

The fix is to say what must be **absent**. A property typed `?: never` can
only be missing (or `undefined`):

```ts
type ById = { id: string; email?: never };
type ByEmail = { email: string; id?: never };
```

Now `{ id, email }` matches neither member. A bonus: both members have both
keys, so callers can read `query.id` on the union (it is
`string | undefined`) and narrow by comparing it with `undefined` — no `in`
checks.

The same idea, generalised over a list of keys, gives "at least one of" and
"exactly one of".

## Task

Export these generic types, and use them for the four concrete types in the
starter:

- **`XOR<A, B>`** — an object that is an `A` or a `B`, but not both, and not
  neither. Keys both shapes share are allowed on either side. Each member
  must mark the *other* member's own keys as `?: never`, so that
  `query.id !== undefined` narrows a `UserQuery`.
- **`RequireAtLeastOne<T, K>`** — `T`, except that at least one of the keys
  `K` (default: all of `T`'s keys) must be present **with a value**
  (`email: undefined` does not count). Keys of `T` outside `K` are unchanged.
- **`RequireExactlyOne<T, K>`** — the same, but exactly one of `K` is present
  and the rest of `K` are absent.
- **`UserQuery`**, **`Schedule`**, **`Contact`**, **`Payment`** — as in the
  starter, now enforced. `describeQuery` and `describeSchedule` must still
  compile.

Useful building blocks: `Exclude<keyof B, keyof A>` for "keys only B has", a
mapped type over `K` indexed by `[K]` to produce "one alternative per key",
and `Required<Pick<T, P>>` for "this key, present".

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
