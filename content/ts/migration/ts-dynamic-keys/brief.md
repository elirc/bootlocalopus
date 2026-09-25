The most common error in any JS-to-TS migration:

```
Element implicitly has an 'any' type because expression of type 'string'
can't be used to index type '{ open: string; paid: string; shipped: string; }'.
```

It comes from `LABELS[status]`, `counts[key] = …` and `order[field]`, the
dynamic property access that JavaScript code is full of. The two quick fixes
are both wrong. `as any` switches the check off. Adding
`[key: string]: string` to the type makes **every** string a valid key, so
`LABELS['cancelled']` is typed `string` but is `undefined` at runtime.

The real fix is to say **which** keys are valid, and to be honest where a key
comes from outside and might not be one.

## Task

Fix the types in the starter so the module compiles under `strict` and meets
this spec:

- **`STATUS_LABELS`** keeps its literal values (`as const`), and **`Status`** is
  **derived** from its keys: `'open' | 'paid' | 'shipped'`. It is not written
  out a second time.
- **`isStatus(value: string)`** is a type guard: after it, `value` is a
  `Status`. Use `Object.hasOwn`, because `'toString' in STATUS_LABELS` is `true`.
- **`statusLabel(value: string)`** returns `string | undefined`, `undefined` for
  anything that is not a status.
- **`countByStatus(orders)`** returns `Record<Status, number>` with **every
  status present** (0 when there are none), so `counts.open` is a `number`,
  not `number | undefined`.
- **`getField(order, field)`**: `field` must be a key of `Order`, and the result
  is that field's type (`getField(order, 'placedAt')` is a `Date`).
- **`SortKey`**: the keys of `Order` whose values are `string` or `number`,
  **derived** from `Order` (it comes out as `'id' | 'status' | 'totalCents'`).
  `sortBy(orders, 'placedAt')` and `sortBy(orders, 'tags')` must not compile.

The spec also checks that nothing it inspects is `any`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
