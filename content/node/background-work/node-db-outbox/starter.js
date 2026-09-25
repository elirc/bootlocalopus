/**
 * Resolves to { orderId }.
 *
 * TODO: write the order and an 'order.placed' outbox row in ONE transaction.
 * Today the order is committed on its own and the event is never recorded.
 */
export async function placeOrder(conn, { customer, totalCents }) {
  const { rows } = await conn.query(
    'insert into orders (customer, total_cents) values ($1, $2) returning id',
    [customer, totalCents],
  );
  return { orderId: rows[0].id };
}

/**
 * Resolves to { published, failedId }.
 *
 * TODO: publish unpublished rows oldest first, mark each one as it succeeds,
 * record the failure and stop at the first publish that rejects.
 */
export async function relayOutbox(conn, publish, { batchSize = 10 } = {}) {
  return { published: 0, failedId: null };
}
