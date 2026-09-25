const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fill customers.email_normalized wherever it is NULL.
 * Resolves to { updated }.
 *
 * Today: one statement for the whole table. On 40 million rows it holds row
 * locks on all of them for twenty minutes, bloats the table, lags every
 * replica, and a failure at minute nineteen throws it all away.
 */
export async function backfillNormalizedEmails(conn, { batchSize = 500, pauseMs = 0, sleep = defaultSleep } = {}) {
  const { rows } = await conn.query(
    'update customers set email_normalized = lower(btrim(email)) where email_normalized is null returning id',
  );
  return { updated: rows.length };
}
