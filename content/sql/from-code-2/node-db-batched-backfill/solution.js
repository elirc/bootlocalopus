const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fill customers.email_normalized = lower(btrim(email)) wherever it is
 * NULL, batchSize rows per statement, each statement its own transaction.
 * Safe to stop and rerun: finished rows are no longer NULL.
 * Resolves to { updated }: how many rows this run changed.
 */
export async function backfillNormalizedEmails(conn, { batchSize = 500, pauseMs = 0, sleep = defaultSleep } = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize must be a positive integer');
  if (!Number.isSafeInteger(pauseMs) || pauseMs < 0) throw new RangeError('pauseMs must be a non-negative integer');

  let updated = 0;
  let afterId = 0;
  for (let first = true; ; first = false) {
    if (!first && pauseMs > 0) await sleep(pauseMs); // let replicas and other queries breathe

    // Keyset over the primary key: each batch starts where the last one
    // ended, so batch 1,000 costs what batch 1 did (OFFSET would not).
    // Autocommit: each statement commits on its own, so locks are held for
    // one batch only and progress survives a crash.
    const { rows } = await conn.query(
      `update customers
          set email_normalized = lower(btrim(email))
        where id in (
          select id from customers
           where id > $1 and email_normalized is null
           order by id
           limit $2)
        returning id`,
      [afterId, batchSize],
    );
    if (rows.length === 0) return { updated };
    updated += rows.length;
    afterId = Math.max(...rows.map((r) => r.id));
  }
}
