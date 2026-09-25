The `Money` type from earlier in this chapter throws `CurrencyMismatchError`
when you add pounds to dollars. That is correct, and it happens in
production, in the refund job, at 2am. A multi-currency codebase can move
that check to the compiler by making the currency part of the **type**:
`Money<'GBP'>` and `Money<'USD'>` are different types, `add` only accepts two
of the same, and a conversion rate says which way it goes.

The same trick fixes allocation: `allocate(total, [1, 1, 1])` can return
**exactly three** parts, so `const [a, b, c, d] = …` is a compile error rather
than a `d` that is `undefined`.

## Task

The runtime bodies in the starter are correct (and keep their runtime
checks, as a second line of defence). Change only the types and signatures so
the spec compiles. Export:

| export | type |
| --- | --- |
| `Currency` | given: `'GBP' \| 'USD' \| 'EUR' \| 'JPY'` |
| `Money<C extends Currency>` | `{ readonly amountMinor: number; readonly currency: C }` |
| `Rate<From, To>` (both `extends Currency`) | `{ readonly from: From; readonly to: To; readonly multiplier: number }` |
| `NonEmptyArray<T>` | a readonly array with at least one element |
| `money(amountMinor, currency)` | `Money<`that currency`>` — `money(1, 'GBP')` is `Money<'GBP'>`; a `Currency`-typed variable gives `Money<Currency>` |
| `add(a, b)` | both the same currency, result that currency |
| `sum(currency, items)` | items all in `currency`; result `Money<currency>`, even for `[]` |
| `rate(from, to, multiplier)` | `Rate<from, to>` |
| `convert(m, rate)` | `rate` must convert **from** `m`'s currency; result is `Money<to>` |
| `allocate(m, ratios)` | `ratios` must be non-empty; returns a **tuple** with one `Money` (in `m`'s currency) per ratio: `allocate(gbp, [1, 1, 1])` is `[Money<'GBP'>, Money<'GBP'>, Money<'GBP'>]` |

## The traps

- `function add<C>(a: Money<C>, b: Money<C>)` **accepts** `add(gbp, usd)`:
  TypeScript infers `C` from both arguments and settles on
  `'GBP' | 'USD'`. Stop the second argument from voting with
  `NoInfer<C>` (TypeScript 5.4+).
- To get a tuple back, capture the ratios as a type parameter constrained to
  a non-empty tuple (`R extends NonEmptyArray<number>`) and **map** over it:
  `{ -readonly [K in keyof R]: Money<C> }`. A mapped type over a tuple type
  produces a tuple of the same length. The body then needs one `as` cast,
  because `Array.prototype.map` returns a plain array.
- A `number[]` might be empty, so it must not be accepted where a
  `NonEmptyArray<number>` is required. A literal `[3, 1]` is.
