Reading about code review is not the same as doing one. This is a real-sized
pull request: two files, an Express router and the repository underneath it.
It has **five defects** that would each cause an incident, a breach or a bad
week, and several changes that look suspicious but are **fine**. Flagging a
correct change is not free — it costs the author a round trip and costs you
credibility on the comments that matter.

Read it the way you would at work: what does each changed line do with real
traffic, real data and a hostile client?

**PR #482 — "Orders: pagination, search, cancel with refund, admin list"**

> Adds pagination to `GET /orders`, a reference search, customer
> cancellation with an automatic refund through the payments service, and an
> admin view of orders by status. Tested locally against the seed data.

The number on each line is its line number in the **new** file; removed lines
have none. The questions refer to lines as `orders.js:12`.

```diff
--- a/src/routes/orders.js
+++ b/src/routes/orders.js
@@ -1,15 +1,51 @@
   1 import express from 'express';
   2 import * as repo from '../repositories/orderRepository.js';
-    import { requireAuth } from '../auth.js';
+  3 import { requireAuth, requireAdmin } from '../auth.js';
+  4 import { logger } from '../logger.js';
+  5 import { config } from '../config.js';
   6
   7 export const router = express.Router();
   8
   9 router.get('/orders', requireAuth, async (req, res) => {
-    const orders = await repo.listForCustomer(req.user.customerId);
-    res.json({ orders });
+ 10   const page = Math.max(1, Number(req.query.page) || 1);
+ 11   const limit = Math.min(100, Number(req.query.limit) || 20);
+ 12   const offset = page * limit;
+ 13   const orders = await repo.listForCustomer(req.user.customerId, { limit, offset });
+ 14   res.json({ page, limit, orders });
  15 });
  16
+ 17 router.get('/orders/search', requireAuth, async (req, res) => {
+ 18   const q = String(req.query.q ?? '').trim();
+ 19   if (q.length < 3) return res.status(400).json({ error: 'query_too_short' });
+ 20   res.json({ orders: await repo.searchByReference(req.user.customerId, q) });
+ 21 });
+ 22
+ 23 router.post('/orders/:id/cancel', requireAuth, async (req, res) => {
+ 24   const order = await repo.findById(req.params.id);
+ 25   if (!order || order.customer_id !== req.user.customerId) {
+ 26     return res.status(404).json({ error: 'not_found' });
+ 27   }
+ 28   if (order.status !== 'pending') {
+ 29     return res.status(409).json({ error: 'not_cancellable' });
+ 30   }
+ 31   repo.updateStatus(order.id, 'cancelled', req.body.reason ?? '');
+ 32
+ 33   const headers = {
+ 34     'content-type': 'application/json',
+ 35     authorization: `Bearer ${config.paymentsApiKey}`,
+ 36     'idempotency-key': `refund-${order.id}`,
+ 37   };
+ 38   logger.info({ orderId: order.id, headers }, 'requesting refund');
+ 39   const r = await fetch(`${config.paymentsUrl}/refunds`, {
+ 40     method: 'POST',
+ 41     headers,
+ 42     body: JSON.stringify({ orderId: order.id, amountCents: order.total_cents }),
+ 43   });
+ 44   if (!r.ok) return res.status(502).json({ error: 'refund_failed' });
+ 45   res.status(204).end();
+ 46 });
+ 47
+ 48 router.get('/admin/orders', requireAdmin, async (req, res) => {
+ 49   const status = String(req.query.status ?? 'pending');
+ 50   res.json({ orders: await repo.listByStatus(status) });
+ 51 });
```

```diff
--- a/src/repositories/orderRepository.js
+++ b/src/repositories/orderRepository.js
@@ -1,17 +1,46 @@
   1 import { db } from '../db.js';
   2
   3 export async function findById(id) {
   4   const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
   5   return rows[0] ?? null;
   6 }
   7
-    export async function listForCustomer(customerId) {
+  8 export async function listForCustomer(customerId, { limit, offset }) {
   9   const { rows } = await db.query(
  10     `SELECT id, reference, status, total_cents, created_at
  11        FROM orders
  12       WHERE customer_id = $1
-         ORDER BY created_at DESC`,
-     [customerId],
+ 13       ORDER BY created_at DESC, id DESC
+ 14       LIMIT $2 OFFSET $3`,
+ 15     [customerId, limit, offset],
  16   );
  17   return rows;
  18 }
+ 19
+ 20 export async function searchByReference(customerId, term) {
+ 21   const pattern = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
+ 22   const { rows } = await db.query(
+ 23     `SELECT id, reference, status, total_cents, created_at
+ 24        FROM orders
+ 25       WHERE customer_id = $1 AND reference ILIKE $2
+ 26       ORDER BY created_at DESC, id DESC
+ 27       LIMIT 50`,
+ 28     [customerId, pattern],
+ 29   );
+ 30   return rows;
+ 31 }
+ 32
+ 33 export async function updateStatus(id, status, note) {
+ 34   await db.query(
+ 35     "UPDATE orders SET status = $1, status_note = '" + note + "', updated_at = now() WHERE id = $2",
+ 36     [status, id],
+ 37   );
+ 38 }
+ 39
+ 40 export async function listByStatus(status) {
+ 41   const { rows } = await db.query(
+ 42     'SELECT id, customer_id, reference, status, total_cents, created_at FROM orders WHERE status = $1 ORDER BY created_at DESC',
+ 43     [status],
+ 44   );
+ 45   return rows;
+ 46 }
```

Context you would know from the codebase: `db` is a `pg` connection pool;
`orders` holds a few million rows and grows by tens of thousands a day;
`requireAuth` sets `req.user`; logs are shipped to a third-party log service
that most of engineering can search; the app runs Express 4, whose router does
not catch a rejected promise from an `async` handler.
