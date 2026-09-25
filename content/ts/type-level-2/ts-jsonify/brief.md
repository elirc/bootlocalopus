The server has an `Order` with `placedAt: Date`. The front end imports the same
`Order` type for the API response, calls `order.placedAt.getTime()`, and it
compiles. In production it throws `getTime is not a function`: over the wire
a `Date` is a **string**. Methods are gone, `undefined` keys are gone, and an
`undefined` inside an array became `null`. The shared type lied.

The fix used by tRPC-style stacks and `type-fest` is a type that describes what
`JSON.parse(JSON.stringify(value))` actually gives you, derived from the
original — a recursive type.

## Task

Export two types (the starter's `roundTrip` then types itself):

**`Json`** — any JSON value: `string`, `number`, `boolean`, `null`, an array of
`Json`, or an object whose values are `Json`. It is recursive. A `Date`,
`undefined` or function anywhere inside must not be assignable to it.

**`Jsonify<T>`** — follow what `JSON.stringify` does, in this order:

1. If `T` has a `toJSON()` method, the result is `Jsonify` of **what `toJSON`
   returns**. (That is the whole reason `Date` becomes `string`.)
2. `string`, `number`, `boolean` and `null` (and their literals) stay as they are.
3. `undefined`, functions, `symbol` and `bigint` on their own become `never`.
4. Arrays (including `readonly` ones) become **mutable** arrays of their
   jsonified element, except that an element type that is `undefined`, a
   function or a `symbol` becomes `null` — `[1, undefined]` stringifies to
   `[1,null]`. So `(number | undefined)[]` → `(number | null)[]`.
5. Objects keep their keys, recursively jsonified, **except** that:
   - a key whose type is *entirely* functions / `undefined` / `symbol` is
     dropped (a method `total(): number`, an optional callback
     `onChange?: () => void`, a `debug: undefined`);
   - `symbol` keys are dropped;
   - optional keys stay optional (`paidAt?: Date` → `paidAt?: string`).

Unions distribute: `Jsonify<Date | null>` is `string | null`, and a union of
object types stays a union.

The spec checks exact equality against a hand-written DTO, that the result is
assignable to `Json`, and that `roundTrip(order).placedAt.getTime()` does not
compile.

The trap is order: `Date` is an `object`, so if the object branch comes before
the `toJSON` check you get a mapped type of `Date`'s methods — which then all
get dropped, giving `{}`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
