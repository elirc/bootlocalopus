/**
 * The user repository. Today it leaks snake_case rows to the rest of the
 * app, and update() writes every field, so a PATCH that only sends
 * displayName wipes the bio and fails on the email.
 */
export function createUserRepository(conn) {
  return {
    async findById(id) {
      const { rows } = await conn.query('select * from users where id = $1', [id]);
      return rows[0];
    },

    async create({ email, displayName, bio }) {
      const { rows } = await conn.query(
        'insert into users (email, display_name, bio) values ($1, $2, $3) returning *',
        [email, displayName, bio],
      );
      return rows[0];
    },

    async update(id, patch) {
      const { rows } = await conn.query(
        'update users set email = $1, display_name = $2, bio = $3 where id = $4 returning *',
        [patch.email, patch.displayName, patch.bio, id],
      );
      return rows[0];
    },

    async remove(id) {
      await conn.query('delete from users where id = $1', [id]);
      return true;
    },
  };
}
