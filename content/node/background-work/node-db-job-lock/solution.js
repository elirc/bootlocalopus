/**
 * Take or renew the lock in one atomic statement.
 * The row is written only if it is new, expired, or already ours.
 */
export async function tryAcquire(conn, { name, owner, ttlMs, now }) {
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const { rows } = await conn.query(
    `insert into job_locks (name, owner, locked_until)
     values ($1, $2, $3)
     on conflict (name) do update
       set owner = excluded.owner, locked_until = excluded.locked_until
       where job_locks.locked_until <= $4 or job_locks.owner = excluded.owner
     returning owner`,
    [name, owner, lockedUntil, now],
  );
  return rows.length === 1;
}

/** Delete the lock only if we hold it. */
export async function release(conn, { name, owner }) {
  const { rows } = await conn.query(
    'delete from job_locks where name = $1 and owner = $2 returning name',
    [name, owner],
  );
  return rows.length === 1;
}

export async function runExclusive(conn, { name, owner, ttlMs, now }, fn) {
  if (!(await tryAcquire(conn, { name, owner, ttlMs, now }))) return { ran: false };
  try {
    const result = await fn();
    return { ran: true, result };
  } finally {
    // Runs on success and on throw; a throw from fn propagates unchanged.
    await release(conn, { name, owner });
  }
}
