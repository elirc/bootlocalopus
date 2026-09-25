Most review checklists are about code: names, tests, error handling. The
changes that take production down are more often about **order**: a schema
change that the old version of the code, still running during the deploy,
cannot survive; an index build that locks the busiest table; a feature flag
whose fallback turns the new path on for everyone when the flag service
hiccups; a CI change that lets the deploy run before the tests finish.

This PR has **five defects** of that kind, and several changes that look
risky but are **fine**. Review it the way you would at work: for each line,
ask what happens **during** the deploy, when old and new code run side by
side against one database, and what happens when you need to roll back.

**PR #911 — "Pricing v2: totals in cents, currency column, new pricing behind a flag"**

> Renames `orders.total` to `total_cents` (it was always cents, the name was
> confusing), adds a currency column, and adds the v2 pricing engine behind
> the `pricing-v2` flag. Also tidies the CI workflow.
>
> **Rollback:** revert this PR.

The deploy runs migrations first, then does a rolling restart of 12 app
servers, which takes about ten minutes. `orders` has 40 million rows and
takes a few hundred writes a second.

The number on each line is its line number in the **new** file; removed
lines have none.

```diff
--- /dev/null
+++ b/migrations/0042_pricing_v2.sql
+  1 -- Pricing v2
+  2 ALTER TABLE orders RENAME COLUMN total TO total_cents;
+  3
+  4 ALTER TABLE orders ADD COLUMN currency text NOT NULL DEFAULT 'GBP';
+  5
+  6 ALTER TABLE orders ADD COLUMN discount_cents integer;
+  7
+  8 CREATE INDEX orders_customer_created_idx ON orders (customer_id, created_at);
```

```diff
--- a/src/pricing.js
+++ b/src/pricing.js
@@ -1,10 +1,13 @@
   1 import { db } from './db.js';
   2 import { flags } from './flags.js';
   3 import { legacyPrice } from './legacyPricing.js';
+  4 import { priceV2 } from './pricingV2.js';
+  5 import { logger } from './logger.js';
   6
   7 export async function quote(req, order) {
-      const price = legacyPrice(order);
-      await db.query('UPDATE orders SET total = $1 WHERE id = $2', [price, order.id]);
+  8   const v2 = await flags.isEnabled('pricing-v2', { userId: req.user.id }, { fallback: true });
+  9   logger.info({ orderId: order.id, pricing: v2 ? 'v2' : 'legacy' }, 'quoting');
+ 10   const price = v2 ? priceV2(order) : legacyPrice(order);
+ 11   await db.query('UPDATE orders SET total_cents = $1 WHERE id = $2', [price, order.id]);
  12   return price;
  13 }
```

```diff
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -1,17 +1,19 @@
   1 on:
   2   push:
   3     branches: [main]
   4 permissions:
   5   contents: read
   6 jobs:
   7   test:
   8     runs-on: ubuntu-latest
+  9     timeout-minutes: 20
  10     steps:
  11       - uses: actions/checkout@v4
  12       - run: npm ci && npm test
  13   deploy:
  14     runs-on: ubuntu-latest
-        needs: [test]
+ 15     needs: []
+ 16     concurrency: production
  17     steps:
  18       - uses: actions/checkout@v4
  19       - run: ./scripts/migrate.sh && ./scripts/rolling-restart.sh
```

(`needs: []` was changed so the deploy "doesn't wait on flaky tests".)
