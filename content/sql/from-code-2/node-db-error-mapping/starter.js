export class ConflictError extends Error {
  constructor(field, options) {
    super(`${field} is already taken`, options);
    this.name = 'ConflictError';
    this.field = field;
  }
}

export class NotFoundError extends Error {
  constructor(entity, options) {
    super(`${entity} not found`, options);
    this.name = 'NotFoundError';
    this.entity = entity;
  }
}

export class ValidationError extends Error {
  constructor(field, options) {
    super(`${field} is invalid`, options);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** The domain error for a known constraint violation; otherwise `err` itself. */
export function translateDbError(err) {
  return err;
}

/**
 * Insert a user and resolve to its id.
 *
 * Today: checks first, then inserts. Two sign-ups with the same email in
 * the same second both pass the check, and the loser gets a 500.
 */
export async function registerUser(conn, { email, username, age }) {
  const taken = await conn.query('select 1 from users where lower(email) = lower($1)', [email]);
  if (taken.rows.length > 0) throw new ConflictError('email');
  const { rows } = await conn.query(
    'insert into users (email, username, age) values ($1, $2, $3) returning id',
    [email, username, age],
  );
  return rows[0].id;
}

/** Add a user to a team. */
export async function addMember(conn, { teamId, userId, role }) {
  await conn.query('insert into memberships (team_id, user_id, role) values ($1, $2, $3)', [teamId, userId, role]);
}
