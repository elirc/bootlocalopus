Form state is where untyped strings pile up. A checkout form has
`form.set('items.0.qty', value)`, `form.errors.items[1].qty` and
`watch('customer.address.city')`. Rename `qty` to `quantity` and nothing fails
to compile: the form just stops updating. react-hook-form, Formik and TanStack
Form all solve this with the types you build in this boss: paths that include
**array positions**, the value at a path, and an errors object that mirrors
the values.

This combines the chapter: recursive mapped types, template-literal paths,
segment-by-segment parsing, and a mapped tuple.

## Task

The runtime (`createForm`, `getIn`, `setIn`) is written. Export the types and
type the `Form<T>` interface.

A **leaf** is `string`, `number`, `boolean`, `bigint`, `symbol`, `null`,
`undefined` or `Date`. Form values in this lesson have no optional keys and no
nullable *objects* (a leaf may be nullable: `coupon: string | null`).

**`FieldPath<T>`**: the union of every dotted path:

- every string key of an object is a path, and so is `key.` + each path of its
  value;
- an **array** is a path, and its positions are too: `` `items.${number}` ``,
  then `` `items.${number}.qty` `` and so on for the element type
  (`tags: string[]` gives `'tags' | `` `tags.${number}` ``);
- leaves (including `Date`) have no paths below them; `FieldPath<string>` is
  `never`.

**`FieldValue<T, P>`**: the type at path `P`, one segment at a time. An array
takes a numeric segment and gives its element type (not `| undefined`); a
non-numeric segment on an array, or an unknown key, gives `never`.

**`FormErrors<T>`**: the same shape as `T` with every level optional: a leaf
becomes `string` (the message), an object becomes an object of **optional**
keys, and an array of `E` becomes `(FormErrors<E> | undefined)[]`.

**`Form<T>`**, with `P extends FieldPath<T>` on every method that takes a path:

| member | type |
| --- | --- |
| `values` | `readonly values: T` |
| `errors` | `FormErrors<T>` |
| `get(path)` | returns `FieldValue<T, P>` |
| `set(path, value)` | `value: FieldValue<T, P>`, returns `void` |
| `watch(...paths)` | returns a **tuple**: one `FieldValue` per path, in order; `watch()` gives `[]` |
| `setError(path, message)` | `message: string`, returns `void` |

The spec checks all three types with exact equality on a realistic `Checkout`
form, then calls every method with right and wrong paths and values.

Traps:

- `key-paths` earlier in this chapter treated arrays as leaves. Here they are
  not, and their segments are `${number}`, not `keyof E[]`: `'0'` is not a key
  of `string[]` as far as `keyof` is concerned.
- `watch` needs its own type parameter for the whole tuple of paths:
  `watch<Ps extends readonly FieldPath<T>[]>(...paths: Ps)`, then a mapped type
  over `Ps`. Inside that mapped type the checker cannot prove `Ps[I]` is a
  string, so intersect it: `Ps[I] & string`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
