/**
 * Run `work(conn)` in a transaction.
 *
 * Today: called inside another withTransaction, its BEGIN is ignored (with a
 * warning) and its COMMIT commits the caller's transaction halfway through.
 */
export async function withTransaction(conn, work) {
  await conn.query('begin');
  try {
    const result = await work(conn);
    await conn.query('commit');
    return result;
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}

/** Create a user and its audit entry, atomically. Resolves to the new id. */
export function createUser(conn, email) {
  return withTransaction(conn, async (tx) => {
    const { rows } = await tx.query('insert into users (email) values ($1) returning id', [email]);
    await tx.query("insert into audit (event, subject) values ('user.created', $1)", [email]);
    return rows[0].id;
  });
}

/**
 * Create a team and a user for each email, skipping emails that already
 * have an account. Resolves to { teamId, created, skipped }.
 */
export function inviteTeam(conn, { teamName, emails }) {
  return withTransaction(conn, async (tx) => {
    const { rows } = await tx.query('insert into teams (name) values ($1) returning id', [teamName]);
    const teamId = rows[0].id;
    const created = [];
    const skipped = [];
    for (const email of emails) {
      try {
        const userId = await createUser(tx, email);
        await tx.query('insert into memberships (team_id, user_id) values ($1, $2)', [teamId, userId]);
        created.push(email);
      } catch (err) {
        if (err && err.code === '23505') skipped.push(email);
        else throw err;
      }
    }
    return { teamId, created, skipped };
  });
}
