```ts
sortBy(orders, 'customer'); // compiles; sorts by "[object Object]", i.e. not at all
sumBy(orders, 'id');        // compiles; returns "0ord_1ord_2ord_3"
```

`key: keyof T` says "any property", and most helpers mean something narrower:
a property whose **value** is sortable, summable, or usable as a map key. The
constraint belongs on the value type, and TypeScript can express it: map each
key to itself when its value fits, to `never` when it does not, then index the
mapped type to collect the survivors.

```ts
type KeysMatching<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
```

That is nearly right. The trap is **optional properties**. For `note?: string`,
the mapped type's `note` entry is itself optional, so indexing it adds
`undefined` to the result — and `undefined` then passes as a key. The `-?`
modifier removes that. The value check is right as it stands: an optional
key's value is `string | undefined`, which is *not* a `string`, so `note` only
matches when you ask for `string | undefined`. That is what you want: summing
an optional `discount` gives `NaN` the first time one is missing.

## Task

Export:

- **`KeysMatching<T, V>`** — the keys of `T` whose value type is assignable
  to `V`. Optional keys match only if `V` allows `undefined`; if nothing
  matches, the result is `never`.
- **`Sortable`** — `string | number | Date` (it is in the starter).
- **`sortBy(items, key, direction?)`** — `items: readonly T[]`; `key` must be
  a key whose value is `Sortable`; `direction` is `'asc' | 'desc'`, default
  `'asc'`. Returns a sorted **copy**, typed `T[]`. Booleans, objects, arrays
  and optional keys are rejected.
- **`sumBy(items, key)`** — `key` must be a key whose value is `number`;
  returns a `number`.
- **`indexBy(items, key)`** — `key` must be a key whose value is a
  `PropertyKey` (`string | number | symbol`); returns a `Map` from that value
  to the item, typed from the key: `indexBy(orders, 'id')` is
  `Map<string, Order>`, and `indexBy(orders, 'seq')` is `Map<number, Order>`.

Inside the implementations, TypeScript cannot follow a mapped type back to the
value, so `item[key]` is not known to be a `number`. One `as` per helper,
guarded by the signature, is the honest trade-off here.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
