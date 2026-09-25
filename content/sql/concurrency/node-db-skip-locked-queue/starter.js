/**
 * Claim up to `limit` runnable jobs from `queue`.
 * Resolves to [{ id, payload, attempts }], oldest run_at first.
 *
 * What is in production: two workers read the same rows and both run them,
 * a crashed worker's jobs stay 'running' for ever, and run_at is ignored.
 */
export async function claimJobs(conn, { queue, limit, now, leaseMs }) {
  const { rows } = await conn.query(
    "select id, payload, attempts from jobs where queue = $1 and status = 'queued' order by id limit $2",
    [queue, limit],
  );
  const ids = rows.map((r) => r.id);
  await conn.query("update jobs set status = 'running', attempts = attempts + 1 where id = any($1)", [ids]);
  return rows.map((r) => ({ ...r, attempts: r.attempts + 1 }));
}

export async function completeJob(conn, { id, attempts }) {
  await conn.query("update jobs set status = 'done' where id = $1", [id]);
  return true;
}

export async function failJob(conn, { id, attempts, error, now, maxAttempts, backoffMs }) {
  throw new Error('not implemented');
}
