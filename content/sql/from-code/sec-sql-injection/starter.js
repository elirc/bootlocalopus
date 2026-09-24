/** Thrown for input the endpoint must reject. The HTTP layer maps it to a 400. */
export class BadRequestError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'BadRequestError';
    this.status = 400;
    this.field = field;
  }
}

/**
 * GET /notes?q=…&sort=…&dir=… for the signed-in user.
 * `query` is the parsed query string: every value is a string, an array of
 * strings (?sort=a&sort=b), or undefined.
 *
 * This is the version in production. Fix it.
 */
export async function searchNotes(conn, ownerId, query = {}) {
  const { q = '', sort = 'created_at', dir = 'desc' } = query;
  const sql = `select id, title from notes
    where owner_id = ${ownerId} and title ilike '%${q}%'
    order by ${sort} ${dir}`;
  const { rows } = await conn.query(sql);
  return rows;
}
