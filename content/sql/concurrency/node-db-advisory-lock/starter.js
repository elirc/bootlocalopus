/**
 * Run `work(conn)` in a transaction, but only if no other process holds the
 * advisory lock for `name`. Resolves to { ran: false } or { ran: true, result }.
 *
 * Today: no lock at all. Three servers, three runs.
 */
export async function runExclusive(conn, name, work) {
  const result = await work(conn);
  return { ran: true, result };
}

/** Invoice every active subscription for `day`, at most once. */
export async function runDailyInvoicing(conn, day) {
  const outcome = await runExclusive(conn, 'daily-invoicing', async (tx) => {
    const created = await tx.query(
      'insert into invoices (subscription_id, day, amount_cents) select id, $1, price_cents from subscriptions returning id',
      [day],
    );
    return { status: 'ran', invoiced: created.rows.length };
  });
  return outcome.result;
}
