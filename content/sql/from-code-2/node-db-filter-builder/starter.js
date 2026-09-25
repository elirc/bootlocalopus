export class BadFilterError extends Error {
  constructor(field, message) {
    super(`bad filter ${field}: ${message}`);
    this.name = 'BadFilterError';
    this.field = field;
  }
}

/**
 * Turn a filters object into `{ clause, params }`.
 *
 * Today: string concatenation. It works for the demo, and it is an
 * injection hole for every other input.
 */
export function buildWhere(filters = {}) {
  const conditions = [];
  if (filters.status) conditions.push(`status = '${filters.status}'`);
  if (filters.assigneeId !== undefined) conditions.push(`assignee_id = ${filters.assigneeId}`);
  if (filters.search) conditions.push(`title ilike '%${filters.search}%'`);
  return { clause: conditions.length ? `where ${conditions.join(' and ')}` : '', params: [] };
}

export async function listTickets(conn, filters = {}, { limit = 50 } = {}) {
  const { clause, params } = buildWhere(filters);
  const { rows } = await conn.query(
    `select * from tickets ${clause} order by created_at desc limit ${limit}`,
    params,
  );
  return rows;
}
