```ts
function refund(userId: string, orderId: string, amount: number) { … }
refund(order.id, order.customerId, order.totalCents / 100);
```

That compiles. Two arguments are swapped and the amount is in the wrong unit,
and TypeScript cannot help, because to a *structural* type system every
`string` is the same as every other `string`. A **brand** gives a primitive a
compile-time-only tag, so a `UserId` and an `OrderId` stop being
interchangeable while both stay plain strings at runtime:

```ts
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };
```

The only way to get a branded value is through a function that checks it —
which moves validation to the boundary, once, instead of everywhere.

## Task

Export these types, each **distinct** from the others and from its base type
(and not `any`):

- `UserId` — a `string`; valid ids match `/^usr_[a-z0-9]{8}$/`
- `OrderId` — a `string`; valid ids match `/^ord_[a-z0-9]{8}$/`
- `Cents` — a `number`; an integer amount of money

and these functions (the runtime bodies in the starter are fine; fix the
types, adding a cast only where a validated value becomes branded):

| export | signature |
| --- | --- |
| `userId(raw)` | `(raw: string) => UserId`, throws on an invalid id |
| `orderId(raw)` | `(raw: string) => OrderId`, throws on an invalid id |
| `isUserId(value)` | `(value: unknown) => value is UserId` |
| `assertUserId(value)` | `(value: unknown) => asserts value is UserId` |
| `cents(amount)` | `(amount: number) => Cents`, throws on a non-integer |
| `addCents(a, b)` | two `Cents` in, `Cents` out |
| `multiplyCents(amount, factor)` | `Cents` times a plain `number`, `Cents` out |
| `sumCents(amounts)` | a **readonly** array of `Cents` in, `Cents` out |

The spec checks that:

- `UserId` and `OrderId` cannot be passed for each other, and a raw string
  literal is neither;
- a branded id is still usable as a `string` and `Cents` as a `number`;
- after `if (isUserId(x))` or `assertUserId(x)`, `x` is a `UserId`;
- `price + shipping` is a plain `number` (the brand is lost), but the helpers
  return `Cents`; `addCents(price, 499)` and `sumCents([1999, 499])` do not
  compile.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
