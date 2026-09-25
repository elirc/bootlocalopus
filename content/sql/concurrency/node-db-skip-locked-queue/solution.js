function validateClaim({ queue, limit, now, leaseMs } = {}) {
  if (typeof queue !== 'string' || queue === '') throw new RangeError('queue must be a non-empty string');
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError('now must be a valid Date');
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new RangeError('leaseMs must be a positive integer');
}

/**
 * Claim up to `limit` runnable jobs from `queue`: queued jobs that are due,
 * and running jobs whose worker's lease has expired (it crashed or hung).
 * Resolves to [{ id, payload, attempts }], oldest run_at first.
 */
export async function claimJobs(conn, input) {
  validateClaim(input);
  const { queue, limit, now, leaseMs } = input;
  const lockedUntil = new Date(now.getTime() + leaseMs);

  // One statement: find, lock and claim. SKIP LOCKED makes a concurrent
  // worker step over rows this statement has locked instead of queueing
  // behind them, so N workers claim N different batches in parallel.
  const { rows } = await conn.query(
    `with next as (
       select id
         from jobs
        where queue = $1
          and (   (status = 'queued'  and run_at <= $2)
               or (status = 'running' and locked_until <= $2))
        order by run_at, id
        limit $3
        for update skip locked
     )
     update jobs j
        set status = 'running',
            attempts = j.attempts + 1,
            locked_until = $4
       from next
      where j.id = next.id
     returning j.id, j.payload, j.attempts, j.run_at`,
    [queue, now, limit, lockedUntil],
  );

  // RETURNING has no guaranteed order.
  rows.sort((a, b) => a.run_at - b.run_at || a.id - b.id);
  return rows.map(({ id, payload, attempts }) => ({ id, payload, attempts }));
}

/**
 * Mark a job done. `attempts` is the value claimJobs returned: it proves the
 * caller still owns the job. Resolves to false when it does not (its lease
 * expired and another worker reclaimed the job).
 */
export async function completeJob(conn, { id, attempts }) {
  const { rows } = await conn.query(
    `update jobs
        set status = 'done', locked_until = null
      where id = $1 and status = 'running' and attempts = $2
      returning id`,
    [id, attempts],
  );
  return rows.length === 1;
}

/**
 * Record a failure: back to the queue with exponential backoff, or 'dead'
 * once `maxAttempts` claims have failed. Resolves to 'retry', 'dead', or
 * null when the caller no longer owns the job.
 */
export async function failJob(conn, { id, attempts, error, now, maxAttempts, backoffMs }) {
  const outcome = attempts >= maxAttempts ? 'dead' : 'retry';
  const runAt = outcome === 'dead' ? now : new Date(now.getTime() + backoffMs * 2 ** (attempts - 1));
  const { rows } = await conn.query(
    `update jobs
        set status = $3, run_at = $4, locked_until = null, last_error = $5
      where id = $1 and status = 'running' and attempts = $2
      returning id`,
    [id, attempts, outcome === 'dead' ? 'dead' : 'queued', runAt, String(error)],
  );
  return rows.length === 1 ? outcome : null;
}
