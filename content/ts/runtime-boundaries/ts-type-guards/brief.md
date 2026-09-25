A webhook body, a `postMessage` payload or a row from a JSON column arrives as
`unknown`. The quick fix is `const order = body as Order`, which checks nothing.
The next fix is an `isOrder(body): boolean` with the right checks inside. It
does check at runtime, but a function returning `boolean` tells the compiler
nothing, so the very next line still needs the cast:

```ts
if (isOrder(body)) {
  body.id; // error: 'body' is of type 'unknown'
}
```

A **type predicate** (`value is Order`) is what connects the runtime check to
the type. Written generically, small predicates compose: `hasKeyOf(v, 'id',
isString)` narrows `v` to `Record<'id', string>`, and `&&` intersects each
narrowing with the last.

The spec is type-level: it calls your guards inside `if`s and checks what the
compiler knows afterwards.

## Task

The runtime bodies in the starter are correct. Give each function the right
generic signature. `Guard<T>` is `(value: unknown) => value is T`.

| function | narrows its argument to / returns |
| --- | --- |
| `isRecord(value)` | `Record<string, unknown>` |
| `hasKey(value, key)` | `Record<K, unknown>`, where `K` is the **literal** key passed |
| `hasKeyOf(value, key, guard)` | `Record<K, T>`, where `guard` is a `Guard<T>` |
| `isArrayOf(guard)` | returns `Guard<T[]>` for a `Guard<T>` (nests: `Guard<number[][]>`) |
| `isOneOf(...allowed)` | returns `Guard<'a' \| 'b'>` for `isOneOf('a', 'b')`; non-strings do not compile |
| `nullable(guard)` | returns `Guard<T \| null>` |

The spec checks that two `hasKey`/`hasKeyOf` calls joined with `&&` give an
object with both keys, that narrowing keeps what was already known about a
value, and that you can write an `isOrder(value): value is Order` from these
parts without a single cast.

The trap is `hasKey(value: unknown, key: string): value is Record<string,
unknown>`. It compiles and narrows to *"some object"*, which forgets **which**
key was checked: every key is allowed afterwards, and two checks do not add up
to `{ id: unknown; name: unknown }`. The key needs its own
type parameter, `K extends string`, so the literal `'id'` survives.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
