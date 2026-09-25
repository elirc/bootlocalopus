`cart.js` became `cart.ts` this morning, and under `strict` most of its lines
are red. This is the whole chapter in one file: implicit `any`s, a string
index into a lookup table, a `find` that can miss, `JSON.parse` returning
`any`, an untyped listener list, and `e.message` in a `catch`. The rest of the
app is already strict and imports this module, so the result is not just "no
errors": its exported types are what every caller relies on.

## Task

Migrate the starter so it compiles under `strict` and exports exactly these
types and signatures (the spec checks every one with exact equality):

```ts
type Sku = 'MUG-1' | 'TEE-2' | 'CAP-3';           // derived from PRODUCTS, not written out
interface CartLine { sku: Sku; qty: number }
interface Coupon { code: string; percent: number; minCents: number }
interface Summary { subtotalCents: number; discountCents: number; totalCents: number }
type ParseCartResult = { ok: true; lines: CartLine[] } | { ok: false; error: string };
type CheckoutResult = { ok: true; summary: Summary } | { ok: false; error: string };
type CartListener = (summary: Summary) => void;

isSku(value: string): value is Sku
lineTotal(line: CartLine): number
findCoupon(code: string): Coupon | undefined
applyCoupon(subtotalCents: number, code: string): number
parseCart(json: string): ParseCartResult
summarize(lines: readonly CartLine[], code?: string): Summary
onCartChange(listener: CartListener): () => void
checkout(json: string, code?: string): CheckoutResult
```

The runtime decisions the new types force (the spec cannot run your code,
but the reference makes these, and so should you):

- `isSku` checks **own** keys (`Object.hasOwn`), not `in`.
- `applyCoupon` with an unknown code, or a subtotal below the coupon's
  `minCents`, returns the subtotal unchanged.
- `parseCart` treats the JSON as `unknown`: invalid JSON gives
  `{ ok: false, error: 'Cart is not valid JSON' }`, a missing or non-array
  `lines` gives `'Cart has no lines'`, and the first line without a known `sku`
  and a positive integer `qty` gives `` `Line ${i} is invalid` ``.
- `checkout` returns a failed parse as it is, and turns anything thrown
  afterwards into `{ ok: false, error }` via `unknown` (not `e.message`).
- `onCartChange` returns an unsubscribe function; removing a listener twice
  must not remove someone else's (a `Set` makes that free).

The spec also checks that callers **must** handle the misses
(`findCoupon('x').percent` and `parseCart(…).lines` do not compile), that
listeners are strictly typed, and that nothing it inspects is `any`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
