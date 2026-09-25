export class BadFilterError extends Error {
  constructor(field, message) {
    super(`bad filter ${field}: ${message}`);
    this.name = 'BadFilterError';
    this.field = field;
  }
}

const STATUSES = new Set(['open', 'pending', 'closed']);
const isDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

/**
 * One entry per supported filter. Each validates its value and returns
 * either `{ sql }` (a condition with no value) or `{ value, sql(ph) }`: the
 * value to send as a parameter, and the condition given its placeholder.
 * Column names and operators live here; values only travel as parameters.
 */
const FILTERS = {
  status(v) {
    const list = typeof v === 'string' ? [v] : v;
    if (!Array.isArray(list) || list.length === 0 || !list.every((s) => STATUSES.has(s))) {
      throw new BadFilterError('status', 'must be open, pending or closed, or a list of them');
    }
    return { value: list, sql: (ph) => `status = any(${ph}::text[])` };
  },
  assigneeId(v) {
    // `assignee_id = NULL` is never true: "unassigned" needs IS NULL.
    if (v === null) return { sql: 'assignee_id is null' };
    if (!Number.isSafeInteger(v) || v < 1) throw new BadFilterError('assigneeId', 'must be a positive integer or null');
    return { value: v, sql: (ph) => `assignee_id = ${ph}` };
  },
  minPriority(v) {
    if (!Number.isInteger(v) || v < 1 || v > 4) throw new BadFilterError('minPriority', 'must be 1 to 4');
    return { value: v, sql: (ph) => `priority >= ${ph}` };
  },
  tags(v) {
    if (!Array.isArray(v) || v.length === 0 || !v.every(isNonEmptyString)) {
      throw new BadFilterError('tags', 'must be a non-empty list of tags');
    }
    return { value: v, sql: (ph) => `tags @> ${ph}::text[]` };
  },
  createdFrom(v) {
    if (!isDate(v)) throw new BadFilterError('createdFrom', 'must be a valid Date');
    return { value: v, sql: (ph) => `created_at >= ${ph}` };
  },
  createdTo(v) {
    if (!isDate(v)) throw new BadFilterError('createdTo', 'must be a valid Date');
    return { value: v, sql: (ph) => `created_at < ${ph}` };
  },
  search(v) {
    if (!isNonEmptyString(v)) throw new BadFilterError('search', 'must be a non-empty string');
    // strpos matches literally: a % or _ in the search is just a character.
    return { value: v, sql: (ph) => `strpos(lower(title), lower(${ph})) > 0` };
  },
};

/**
 * Turn a filters object into `{ clause, params }`: clause is '' or
 * 'where … and …', with placeholders $1..$n matching params.
 */
export function buildWhere(filters = {}) {
  if (filters === null || typeof filters !== 'object' || Array.isArray(filters)) {
    throw new BadFilterError('filters', 'must be an object');
  }
  const conditions = [];
  const params = [];
  for (const [key, raw] of Object.entries(filters)) {
    if (!Object.hasOwn(FILTERS, key)) throw new BadFilterError(key, 'is not a supported filter');
    if (raw === undefined) continue;
    const condition = FILTERS[key](raw);
    if ('value' in condition) {
      params.push(condition.value);
      conditions.push(condition.sql(`$${params.length}`));
    } else {
      conditions.push(condition.sql);
    }
  }
  return { clause: conditions.length ? `where ${conditions.join(' and ')}` : '', params };
}

const toTicket = (r) => ({
  id: r.id,
  title: r.title,
  status: r.status,
  assigneeId: r.assignee_id,
  priority: r.priority,
  tags: r.tags,
  createdAt: r.created_at,
});

/** Newest first, at most `limit` tickets matching every filter. */
export async function listTickets(conn, filters = {}, { limit = 50 } = {}) {
  const { clause, params } = buildWhere(filters);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadFilterError('limit', 'must be 1 to 100');
  params.push(limit);
  const { rows } = await conn.query(
    `select id, title, status, assignee_id, priority, tags, created_at
       from tickets
       ${clause}
      order by created_at desc, id desc
      limit $${params.length}`,
    params,
  );
  return rows.map(toTicket);
}
