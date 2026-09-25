export class EmailTakenError extends Error {}
export class UserNotFoundError extends Error {}
export class StoreUnavailableError extends Error {}

// The version in production today. Every caller has to know what a
// Postgres error code is, and an outage looks exactly like a missing user.
export function createUserStore(db) {
  return {
    async findById(id) {
      try {
        return (await db.findOne('users', { id })) ?? null;
      } catch {
        return null;
      }
    },

    async getById(id) {
      throw new Error('TODO');
    },

    async create({ email, name }) {
      try {
        return await db.insert('users', { email, name });
      } catch (error) {
        throw new Error('Database error: ' + error.message);
      }
    },

    async rename(id, name) {
      throw new Error('TODO');
    },
  };
}
