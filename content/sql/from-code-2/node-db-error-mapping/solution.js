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

// SQLSTATE → constraint name → the error the application understands.
// Constraint names are part of the schema you control; error messages are
// not (they change with the server's language and version).
const BY_CODE = {
  '23505': {                       // unique_violation
    users_email_lower_key: () => new ConflictError('email'),
    users_username_key: () => new ConflictError('username'),
    teams_slug_key: () => new ConflictError('slug'),
    memberships_pkey: () => new ConflictError('membership'),
  },
  '23503': {                       // foreign_key_violation
    memberships_team_id_fkey: () => new NotFoundError('team'),
    memberships_user_id_fkey: () => new NotFoundError('user'),
  },
  '23514': {                       // check_violation
    users_age_check: () => new ValidationError('age'),
    memberships_role_check: () => new ValidationError('role'),
  },
};

/** The domain error for a known constraint violation; otherwise `err` itself. */
export function translateDbError(err) {
  const byConstraint = err && Object.hasOwn(BY_CODE, err.code) ? BY_CODE[err.code] : null;
  const make = byConstraint && Object.hasOwn(byConstraint, err.constraint) ? byConstraint[err.constraint] : null;
  if (!make) return err;
  const mapped = make();
  mapped.cause = err;
  return mapped;
}

/**
 * Insert a user and resolve to its id. No "does it exist?" query first: the
 * unique index is the only check that holds under concurrency, so let it
 * decide and translate its answer.
 */
export async function registerUser(conn, { email, username, age }) {
  try {
    const { rows } = await conn.query(
      'insert into users (email, username, age) values ($1, $2, $3) returning id',
      [email, username, age],
    );
    return rows[0].id;
  } catch (err) {
    throw translateDbError(err);
  }
}

/** Add a user to a team. Resolves to undefined. */
export async function addMember(conn, { teamId, userId, role }) {
  try {
    await conn.query('insert into memberships (team_id, user_id, role) values ($1, $2, $3)', [teamId, userId, role]);
  } catch (err) {
    throw translateDbError(err);
  }
}
