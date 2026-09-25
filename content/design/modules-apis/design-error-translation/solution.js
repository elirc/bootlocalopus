export class EmailTakenError extends Error {
  constructor(email, options) {
    super('That email address is already registered', options);
    this.name = 'EmailTakenError';
    this.email = email;
  }
}

export class UserNotFoundError extends Error {
  constructor(id) {
    super(`User ${id} not found`);
    this.name = 'UserNotFoundError';
    this.id = id;
  }
}

export class StoreUnavailableError extends Error {
  constructor(options) {
    super('The user store is unavailable', options);
    this.name = 'StoreUnavailableError';
    this.retryable = true;
  }
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01']);

const isConnectionError = (error) =>
  typeof error?.code === 'string' && (CONNECTION_CODES.has(error.code) || error.code.startsWith('08'));

/**
 * Translate only what a caller can act on. Anything else — a SQL typo, a
 * TypeError in our own code — is a bug, and wrapping it would hide it.
 */
function translate(error, { email } = {}) {
  if (error?.code === '23505' && error.constraint === 'users_email_key') {
    return new EmailTakenError(email, { cause: error });
  }
  if (isConnectionError(error)) return new StoreUnavailableError({ cause: error });
  return error;
}

async function run(operation, context) {
  try {
    return await operation();
  } catch (error) {
    throw translate(error, context);
  }
}

export function createUserStore(db) {
  const findById = (id) => run(async () => (await db.findOne('users', { id })) ?? null);

  return {
    findById,

    async getById(id) {
      const user = await findById(id);
      if (user === null) throw new UserNotFoundError(id);
      return user;
    },

    create({ email, name }) {
      return run(() => db.insert('users', { email, name }), { email });
    },

    async rename(id, name) {
      const rows = await run(() => db.update('users', { id }, { name }));
      if (rows.length === 0) throw new UserNotFoundError(id);
      return rows[0];
    },
  };
}
