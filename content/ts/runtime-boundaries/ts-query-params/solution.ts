export const SORT_FIELDS = ['createdAt', 'total', 'status'] as const;
export const STATUSES = ['open', 'paid', 'shipped', 'cancelled'] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type Status = (typeof STATUSES)[number];

export interface ListQuery {
  page: number;
  limit: number;
  sort: { field: SortField; direction: 'asc' | 'desc' };
  status: Status[];
  q: string | undefined;
}

export interface ParamError { param: string; message: string }

export type ParseResult =
  | { ok: true; value: ListQuery }
  | { ok: false; errors: ParamError[] };

const DEFAULTS: ListQuery = {
  page: 1,
  limit: 20,
  sort: { field: 'createdAt', direction: 'desc' },
  status: [],
  q: undefined,
};
const MAX_LIMIT = 100;
const MAX_Q = 100;

const isOneOf = <T extends string>(allowed: readonly T[], value: string): value is T =>
  (allowed as readonly string[]).includes(value);

export function parseListQuery(input: string | URLSearchParams): ParseResult {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const errors: ParamError[] = [];
  const fail = (param: string, message: string) => { errors.push({ param, message }); };

  /** A scalar param: absent or empty gives undefined; given twice is an error, never "first one wins". */
  function single(name: string): string | undefined {
    const all = params.getAll(name);
    if (all.length > 1) {
      fail(name, 'must be given once');
      return undefined;
    }
    return all[0] === '' ? undefined : all[0];
  }

  function positiveInt(name: string): number | undefined {
    const raw = single(name);
    if (raw === undefined) return undefined;
    const n = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (Number.isSafeInteger(n) && n >= 1) return n;
    fail(name, 'must be a positive integer');
    return undefined;
  }

  const page = positiveInt('page') ?? DEFAULTS.page;
  const limit = Math.min(positiveInt('limit') ?? DEFAULTS.limit, MAX_LIMIT);

  let sort = DEFAULTS.sort;
  const rawSort = single('sort');
  if (rawSort !== undefined) {
    const descending = rawSort.startsWith('-');
    const field = descending ? rawSort.slice(1) : rawSort;
    if (isOneOf(SORT_FIELDS, field)) sort = { field, direction: descending ? 'desc' : 'asc' };
    else fail('sort', `must be one of ${SORT_FIELDS.join(', ')}`);
  }

  // `?status=open&status=paid` and `?status=open,paid` both mean the same thing.
  const status: Status[] = [];
  for (const value of params.getAll('status').flatMap((s) => s.split(','))) {
    const v = value.trim();
    if (v === '') continue;
    if (!isOneOf(STATUSES, v)) fail('status', `unknown value "${v}"`);
    else if (!status.includes(v)) status.push(v);
  }

  const rawQ = single('q')?.trim();
  let q: string | undefined = rawQ === '' ? undefined : rawQ;
  if (q !== undefined && q.length > MAX_Q) {
    fail('q', `must be at most ${MAX_Q} characters`);
    q = undefined;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { page, limit, sort, status, q } };
}

/** The canonical query string: defaults left out, so equal queries give equal URLs (and cache keys). */
export function toQueryString(query: ListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== DEFAULTS.page) params.set('page', String(query.page));
  if (query.limit !== DEFAULTS.limit) params.set('limit', String(query.limit));
  if (query.sort.field !== DEFAULTS.sort.field || query.sort.direction !== DEFAULTS.sort.direction) {
    params.set('sort', (query.sort.direction === 'desc' ? '-' : '') + query.sort.field);
  }
  for (const s of query.status) params.append('status', s);
  if (query.q !== undefined) params.set('q', query.q);
  return params.toString();
}
