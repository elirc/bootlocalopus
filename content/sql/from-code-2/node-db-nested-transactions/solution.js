// How deep each connection is in withTransaction calls. A WeakMap keyed by
// the connection: no property added to someone else's object, and nothing
// kept alive after the connection is gone.
const depthOf = new WeakMap();

/**
 * Run `work(conn)` in a transaction. Called inside another withTransaction
 * on the same connection, it becomes a savepoint: its failure undoes only
 * its own writes, and the caller may catch the error and carry on.
 */
export async function withTransaction(conn, work) {
  const depth = depthOf.get(conn) ?? 0;
  const savepoint = `sp_${depth}`;

  await conn.query(depth === 0 ? 'begin' : `savepoint ${savepoint}`);
  depthOf.set(conn, depth + 1);
  try {
    const result = await work(conn);
    // Releasing a savepoint does not commit anything: its writes now belong
    // to the enclosing transaction, and live or die with it.
    await conn.query(depth === 0 ? 'commit' : `release savepoint ${savepoint}`);
    return result;
  } catch (err) {
    if (depth === 0) {
      await conn.query('rollback').catch(() => {});
    } else {
      // Undo this level's writes and clear the "aborted" state, so the
      // enclosing transaction can keep going if its code catches the error.
      await conn.query(`rollback to savepoint ${savepoint}`).catch(() => {});
      await conn.query(`release savepoint ${savepoint}`).catch(() => {});
    }
    throw err;
  } finally {
    depthOf.set(conn, depth);
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
        if (err && err.code === '23505') skipped.push(email); // an account already exists
        else throw err;
      }
    }
    return { teamId, created, skipped };
  });
}
