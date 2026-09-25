/**
 * Resolves to true if `owner` now holds the lock.
 *
 * TODO: one atomic statement. This check-then-write version lets two
 * replicas both take the lock, and it reads the database clock.
 */
export async function tryAcquire(conn, { name, owner, ttlMs, now }) {
  const { rows } = await conn.query('select owner from job_locks where name = $1 and locked_until > now()', [name]);
  if (rows.length > 0) return false;
  await conn.query(
    `insert into job_locks (name, owner, locked_until) values ($1, $2, now())
     on conflict (name) do update set owner = excluded.owner`,
    [name, owner],
  );
  return true;
}

/** TODO: delete the lock only if `owner` holds it. */
export async function release(conn, { name, owner }) {
  await conn.query('delete from job_locks where name = $1', [name]);
  return true;
}

/** TODO: acquire, run, always release. */
export async function runExclusive(conn, { name, owner, ttlMs, now }, fn) {
  return { ran: true, result: await fn() };
}
