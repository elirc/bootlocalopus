/**
 * Write the order and the event describing it atomically. Resolves to { orderId }.
 */
export async function placeOrder(conn, { customer, totalCents }) {
  await conn.query('begin');
  try {
    const { rows } = await conn.query(
      'insert into orders (customer, total_cents) values ($1, $2) returning id',
      [customer, totalCents],
    );
    const orderId = rows[0].id;
    await conn.query(
      'insert into outbox (topic, payload) values ($1, $2::jsonb)',
      ['order.placed', JSON.stringify({ orderId, customer, totalCents })],
    );
    await conn.query('commit');
    return { orderId };
  } catch (error) {
    await conn.query('rollback');
    throw error;
  }
}

/**
 * Publish pending events oldest first, marking each one as soon as the broker
 * accepts it. Stops at the first failure so events stay in order.
 */
export async function relayOutbox(conn, publish, { batchSize = 10 } = {}) {
  const { rows } = await conn.query(
    'select id, topic, payload from outbox where published_at is null order by id limit $1',
    [batchSize],
  );

  let published = 0;
  for (const row of rows) {
    try {
      await publish({ id: row.id, topic: row.topic, payload: row.payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await conn.query('update outbox set attempts = attempts + 1, last_error = $2 where id = $1', [row.id, message]);
      return { published, failedId: row.id };
    }
    // Mark immediately: a crash now costs at most one duplicate, never a lost event.
    await conn.query('update outbox set published_at = now() where id = $1', [row.id]);
    published++;
  }
  return { published, failedId: null };
}
