/** Thrown for input the endpoint must reject. The HTTP layer maps it to a 400. */
export class BadRequestError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'BadRequestError';
    this.status = 400;
    this.field = field;
  }
}

// Identifiers and keywords cannot be bind parameters, so they come from a
// fixed table. The *value* we interpolate is ours; the user's string is only
// ever used as a lookup key.
const SORT_COLUMNS = Object.freeze({ created_at: 'created_at', title: 'title' });
const DIRECTIONS = Object.freeze({ asc: 'asc', desc: 'desc' });

/** undefined -> fallback; an allowlisted string -> its SQL; anything else -> 400. */
function pick(table, value, field, fallback) {
  if (value === undefined) return fallback;
  // Object.hasOwn, not `value in table` or `table[value]`: "constructor" and
  // "__proto__" are reachable through the prototype of any plain object.
  if (typeof value !== 'string' || !Object.hasOwn(table, value)) {
    throw new BadRequestError(field, `${field} must be one of: ${Object.keys(table).join(', ')}`);
  }
  return table[value];
}

export async function searchNotes(conn, ownerId, query = {}) {
  const { q, sort, dir } = query;
  if (q !== undefined && typeof q !== 'string') {
    throw new BadRequestError('q', 'q must be a single string');
  }
  const column = pick(SORT_COLUMNS, sort, 'sort', 'created_at');
  const direction = pick(DIRECTIONS, dir, 'dir', 'desc');

  // Values travel as parameters, never as SQL text. strpos matches the text
  // literally, so % and _ in a search are just characters (with ILIKE they
  // would be wildcards and would need escaping).
  const { rows } = await conn.query(
    `select id, title
       from notes
      where owner_id = $1
        and ($2::text = '' or strpos(lower(title), lower($2::text)) > 0)
      order by ${column} ${direction}, id ${direction}`,
    [ownerId, q ?? ''],
  );
  return rows;
}
