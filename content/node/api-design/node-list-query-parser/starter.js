export class QueryError extends Error {
  constructor(details) {
    super('invalid query');
    // TODO: name, status, details
  }
}

export function parseListQuery(query, schema) {
  const params = typeof query === 'string' ? new URLSearchParams(query) : query;
  // TODO: validate every key against schema.filters, convert values by type,
  // parse `sort`, reject repeats, collect every problem into one QueryError,
  // and append the `id` tiebreaker.
  // This naive version trusts whatever the client sends.
  const filters = [];
  for (const [key, value] of params) {
    if (key !== 'sort') filters.push({ field: key, op: 'eq', value });
  }
  return { filters, sort: [] };
}
