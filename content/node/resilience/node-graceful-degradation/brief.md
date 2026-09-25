A product page needs the product. It would *like* reviews and
recommendations. Written as

```js
const [product, reviews, recs] = await Promise.all([catalog(id), reviews(id), recommendations(id)]);
```

it fails completely when the least important service fails, and it is as
slow as the slowest one. **Graceful degradation** means deciding, per
dependency, what the page does without it:

- **Required** (the catalog): no product, no page. Fail — and stop the other
  calls, whose results are now useless.
- **Optional** (reviews, recommendations): give each its **own timeout**, and
  on failure fall back — to the **last good value** for that product if you
  have one (slightly stale reviews beat none), else to an empty list.
- **Say that you degraded.** The response carries which parts are stale or
  missing, so the UI can show "reviews temporarily unavailable" and your
  metrics can count it. Silent fallbacks hide outages.

## Task

Export `createProductPage({ catalog, reviews, recommendations, timeouts = { reviews: 300, recommendations: 200 }, staleEntries = 1000, timers = { setTimeout, clearTimeout } })`
returning `{ getPage }`. Each dependency is called as `dep(productId, signal)`
and returns a promise.

**`getPage(productId)`** starts all three calls at once, each with its own
`AbortController`:

- **catalog** has no timeout. If it fails, abort the other two calls and
  reject with the catalog's error.
- **reviews** and **recommendations** each get
  `timers.setTimeout(…, timeouts[name])`. When the timer fires first, abort
  that call's controller and treat it as failed. Clear the timer when the call
  settles first.
  - Success → use the value, and remember it as the last good value for this
    product.
  - Failure or timeout → if there is a last good value for this product, use
    it and record `'<name>:stale'`; otherwise use `[]` and record
    `'<name>:empty'`.

It resolves `{ product, reviews, recommendations, degraded }`, where
`degraded` lists the records in the order reviews, then recommendations (so
`[]` when everything worked).

Last good values are kept per dependency and product, at most `staleEntries`
products per dependency; when adding one more, forget the product whose value
was stored longest ago (refreshing a product counts as storing it again).
