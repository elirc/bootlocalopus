Every checkout starts with this:

```js
function shippingCost(method, order) {
  if (method === 'standard') return order.subtotalCents >= 5000 ? 0 : 499;
  if (method === 'express') { /* 20 lines */ }
  if (method === 'collection') { /* … */ }
  throw new Error('unknown method');
}
```

plus a second `if` chain somewhere else deciding which methods to *show*, which
drifts out of sync with the first one. Adding "drone delivery" means editing
both chains, and whoever does it will miss one. The **strategy** pattern turns
each branch into an object with the same shape, and the code that uses them
stops knowing their names at all.

## Task

A strategy is `{ id, label, isAvailable(order), costCents(order) }`, where an
order is `{ subtotalCents, weightGrams, country }`. Export three:

| export | `id` | `label` | available when | cost |
| --- | --- | --- | --- | --- |
| `standard` | `'standard'` | `'Standard (3-5 days)'` | always | `499`; `0` when `subtotalCents >= 5000` |
| `express` | `'express'` | `'Express (next day)'` | `country === 'GB'` | `999`, plus `150` for every **started** kg above 2 kg |
| `collection` | `'collection'` | `'Click & collect'` | `country === 'GB'` and `weightGrams <= 20000` | `0` |

Express examples: 2000 g → 999; 2001 g → 1149; 3000 g → 1149; 3001 g → 1299.

Export `createShippingQuoter(strategies)` returning:

- `quotes(order)` — one `{ id, label, costCents }` per **available** strategy,
  cheapest first; equal costs keep the order the strategies were passed in.
- `quote(id, order)` — the cost in cents. Throws `ShippingUnavailableError`
  (export it; it extends `Error`, has `name === 'ShippingUnavailableError'`
  and an `id` property) when `id` is unknown **or** not available for this
  order.

`createShippingQuoter` throws an `Error` if two strategies share an `id`.

## The traps

- The quoter must work with strategies it has never heard of. The tests pass
  it their own. Nothing in it may mention `'standard'` or `'express'`.
- **Never price an unavailable option.** A strategy is allowed to assume
  `isAvailable(order)` was true before `costCents(order)` is called (a
  courier's rate table may simply not have a row for Norway). Ask first,
  then price.
- Use `Math.ceil` for "every started kg"; a float `weightGrams / 1000`
  subtraction will bite you at the boundaries otherwise — work in grams.
