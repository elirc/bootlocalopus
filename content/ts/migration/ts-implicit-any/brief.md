You rename `utils.js` to `utils.ts`, turn on `strict`, and every parameter
is `Parameter 'items' implicitly has an 'any' type`. Adding `: any` to each one
clears the errors in a minute, and that is the most common way a migration
goes wrong: the file now *looks* typed, `groupBy` returns `any`, every caller
gets `any`, and the compiler checks less than it did before you started,
because the errors that were telling you something are gone.

Utility modules are where types pay off most, because every call site
inherits them. That means generics: the type of the result depends on the
type of the input.

## Task

Type every function in the starter (you may add exports and helper types; keep
the behaviour). The spec checks, with exact equality:

| export | type |
| --- | --- |
| `Currency` | `'GBP' \| 'EUR' \| 'USD'` |
| `formatMoney` | `(cents: number, currency?: Currency) => string` (default `'GBP'`) |
| `sumBy(items, amount)` | the callback receives the real item type and **must return a number**; result `number` |
| `groupBy(items, keyOf)` | `Partial<Record<K, T[]>>`, where `K` is what `keyOf` returns: grouping orders by `status` gives `Partial<Record<'open' \| 'paid', Order[]>>` |
| `pick(obj, keys)` | `Pick<T, K>` for the keys passed; a key that is not in `T` is an error |
| `once(fn)` | a function with **the same parameters and return type** as `fn` |

and that **no parameter or result is `any`** (it uses `IsAny`).

Why `Partial` on `groupBy`? A status that no order has is simply **absent**
from the result. With `Record<K, T[]>`, the type says `byStatus.open` is always
an array, and `byStatus.open.length` crashes on a day with no open orders. The
spec requires `byStatus.open.length` to be a compile error.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
