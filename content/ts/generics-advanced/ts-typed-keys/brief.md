Request context, DI containers, test fixtures, plugin registries: they are all a
bag of values of **different** types, keyed by name.

```ts
ctx.set('user', currentUser);
const user = ctx.get('user') as User; // a cast at every read, and a typo is a runtime bug
```

The typed version replaces string names with **key objects that carry the
value's type** — the pattern behind React's `createContext`, and the typed
context keys in many web frameworks:

```ts
const UserKey = key<User>('user');
ctx.set(UserKey, currentUser);
ctx.get(UserKey); // User | undefined, no cast, and no typos possible
```

`T` appears nowhere in a key's runtime shape — it is a **phantom** type
parameter. That creates two traps:

1. TypeScript is structural. If `T` is not used in `Key<T>`'s members, then
   `Key<string>` and `Key<number>` are *the same type*, and one can be
   assigned to the other. You must mention `T` in the structure, typically
   via an optional property keyed by a `declare const phantom: unique symbol`,
   which never exists at runtime.
2. **Variance.** If that property is just `T`, keys are covariant: a
   `Key<'draft' | 'live'>` is assignable to `Key<string>`, and through the
   wider key someone can `set` a value the narrow key's readers never expect.
   A key is read *and* written, so it must be **invariant**. A property of type
   `(value: T) => T` mentions `T` in both an input and an output position.

(An explicit variance annotation, `interface Key<in out T>`, also passes: the
checker trusts it when comparing two `Key`s. The phantom member is the pattern
you will see in most libraries: it predates annotations and puts the variance
in the structure itself, where every reader can see it.)

## Task

Export:

- `Key<T>` — an interface with `readonly name: string` plus whatever phantom
  member makes it distinct and invariant in `T`
- `key<T>(name: string): Key<T>` — a new key object each call (two keys with
  the same name are different keys; identity, not name, is what matters)
- `class Context` with:
  - `set<T>(key: Key<T>, value: T): this` — chainable
  - `get<T>(key: Key<T>): T | undefined`
  - `require<T>(key: Key<T>): T` — throws an `Error` with the message
    `` `missing context value: ${key.name}` `` when absent
  - `has<T>(key: Key<T>): boolean`

Note `has` is generic too: with an invariant key, `Key<string>` is **not** a
`Key<unknown>`, so `has(key: Key<unknown>)` would reject every real key.

Inside `Context` you will store values in a `Map` of unknown values; reading
one back out as `T` needs a single assertion. That is fine: `set` is the only
way in, and its signature guarantees the pairing.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
