Postgres rows come back as `order_id`, `created_at`, `line_items`; the rest of
the app wants `orderId`, `createdAt`, `lineItems`. The usual pattern is a
`camelKeys(row)` helper at the repository boundary — typed `(row: any) => any`,
or worse, with a second hand-maintained `Order` interface next to the row type
that drifts the first time someone adds a column. Instead, derive one from the
other: rename keys **in the type system**, recursively.

## Task

Export four types. Input keys are lower `snake_case` (`unit_price_cents`,
`address_line_2`) or already `camelCase`; there are no leading, trailing or
doubled underscores.

**`CamelCase<S>`** — `'unit_price_cents'` → `'unitPriceCents'`,
`'address_line_2'` → `'addressLine2'`; a string with no underscore is
unchanged.

**`SnakeCase<S>`** — the reverse: every uppercase letter becomes `_` plus its
lowercase. Digits are not letters: `'addressLine2'` → `'address_line2'` (not
`'address_line_2'` — the two are not exact inverses, and that is fine).
A string with no uppercase letters is unchanged.

**`CamelKeys<T>`** and **`SnakeKeys<T>`** — rename every **string** key,
recursively:

- objects: rename keys, recurse into values, keep `?` optional modifiers;
  number and symbol keys are kept as they are;
- arrays: recurse into elements; a mutable array stays mutable and a
  `readonly` array stays `readonly`;
- `Date` and functions are left untouched (their methods are not keys to
  rename); primitives are unchanged; unions distribute.

The spec checks a realistic `OrderRow` with nested objects, an array of
objects, a nullable object, an optional object and a readonly array, both ways.

The trap: a key-remapping mapped type (`[K in keyof T as …]`) over an **array**
does not give you an array back — it gives an object with `length`, `push`,
`map`… So arrays need their own branch, before the object one.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
