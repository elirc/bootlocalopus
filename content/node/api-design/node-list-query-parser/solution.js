export class QueryError extends Error {
  constructor(details) {
    super('invalid query');
    this.name = 'QueryError';
    this.status = 400;
    this.details = details;
  }
}

const PAGINATION = new Set(['limit', 'offset', 'cursor']);
const KEY = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[([a-z]+)\])?$/;

/** Returns { ok: true, value } or { ok: false, error }. */
function convert(type, raw) {
  if (raw === '') return { ok: false, error: 'must not be empty' };
  switch (type) {
    case 'integer': {
      // Test the whole string: parseInt('12abc') is 12, which is the bug.
      if (!/^-?\d+$/.test(raw)) return { ok: false, error: 'must be an integer' };
      const n = Number(raw);
      if (!Number.isSafeInteger(n)) return { ok: false, error: 'is out of range' };
      return { ok: true, value: n };
    }
    case 'boolean':
      if (raw === 'true') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false, error: 'must be true or false' };
    default:
      return { ok: true, value: raw };
  }
}

function parseSort(raw, sortable) {
  const sort = [];
  const seen = new Set();
  for (const item of raw.split(',')) {
    const desc = item.startsWith('-');
    const field = desc ? item.slice(1) : item;
    if (field === '') return { error: 'has an empty item' };
    if (!sortable.includes(field)) return { error: `cannot sort by "${field}"` };
    if (seen.has(field)) return { error: `sorts by "${field}" twice` };
    seen.add(field);
    sort.push({ field, dir: desc ? 'desc' : 'asc' });
  }
  return { sort };
}

export function parseListQuery(query, schema) {
  const params = typeof query === 'string' ? new URLSearchParams(query) : query;
  const { filters: fieldSpecs = {}, sortable = [], defaultSort } = schema;
  const details = {};
  const filters = [];

  // Count first: a repeated key is ambiguous wherever it appears.
  const counts = new Map();
  for (const key of params.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);

  const done = new Set();
  let sort = null;

  for (const [key, raw] of params) {
    if (done.has(key)) continue;
    done.add(key);
    if (counts.get(key) > 1) {
      details[key] = 'must not be repeated';
      continue;
    }
    if (PAGINATION.has(key)) continue;

    if (key === 'sort') {
      const parsed = parseSort(raw, sortable);
      if (parsed.error) details[key] = parsed.error;
      else sort = parsed.sort;
      continue;
    }

    const match = KEY.exec(key);
    const spec = match && Object.hasOwn(fieldSpecs, match[1]) ? fieldSpecs[match[1]] : null;
    if (!spec) {
      details[key] = 'is not a supported filter';
      continue;
    }
    const field = match[1];
    const op = match[2] ?? 'eq';
    if (!(spec.ops ?? ['eq']).includes(op)) {
      details[key] = `does not support "${op}"`;
      continue;
    }

    if (op === 'in') {
      const values = [];
      for (const part of raw.split(',')) {
        const result = convert(spec.type, part);
        if (!result.ok) { details[key] = `item ${JSON.stringify(part)} ${result.error}`; break; }
        values.push(result.value);
      }
      if (!details[key]) filters.push({ field, op, value: values });
    } else {
      const result = convert(spec.type, raw);
      if (result.ok) filters.push({ field, op, value: result.value });
      else details[key] = result.error;
    }
  }

  if (Object.keys(details).length > 0) throw new QueryError(details);

  if (!sort) sort = defaultSort ? (parseSort(defaultSort, [...sortable, 'id']).sort ?? []) : [];
  // A total order: without a unique last key, equal rows swap between pages.
  if (!sort.some((s) => s.field === 'id')) sort.push({ field: 'id', dir: 'asc' });

  return { filters, sort };
}
