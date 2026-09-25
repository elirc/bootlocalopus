/**
 * Run `work(conn)` in a transaction, but only if no other process holds the
 * advisory lock for `name`. Never waits: resolves to { ran: false } at once
 * when the lock is taken, or { ran: true, result } after committing.
 */
export async function runExclusive(conn, name, work) {
  if (typeof name !== 'string' || name === '') throw new RangeError('name must be a non-empty string');

  await conn.query('begin');
  try {
    // The transaction-level lock is released by COMMIT or ROLLBACK, whatever
    // happens: there is no unlock to forget, and it cannot outlive this
    // transaction on a pooled connection. hashtext() maps the name to the
    // integer key advisory locks use.
    const { rows } = await conn.query('select pg_try_advisory_xact_lock(hashtext($1)) as locked', [name]);
    if (!rows[0].locked) {
      await conn.query('rollback');
      return { ran: false };
    }
    const result = await work(conn);
    await conn.query('commit');
    return { ran: true, result };
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}

/**
 * Invoice every active subscription for `day` ('YYYY-MM-DD'), at most once,
 * even when every app server's scheduler fires at the same moment.
 */
export async function runDailyInvoicing(conn, day) {
  const outcome = await runExclusive(conn, 'daily-invoicing', async (tx) => {
    // The lock stops two runs overlapping; only this row stops a second run
    // that starts after the first one has finished.
    const done = await tx.query('select 1 from invoice_runs where day = $1', [day]);
    if (done.rows.length > 0) return { status: 'already-ran' };

    const created = await tx.query(
      `insert into invoices (subscription_id, day, amount_cents)
       select id, $1, price_cents from subscriptions where active
       returning id`,
      [day],
    );
    await tx.query('insert into invoice_runs (day, invoiced) values ($1, $2)', [day, created.rows.length]);
    return { status: 'ran', invoiced: created.rows.length };
  });
  return outcome.ran ? outcome.result : { status: 'locked' };
}
