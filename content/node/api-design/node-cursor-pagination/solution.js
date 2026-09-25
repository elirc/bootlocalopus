export class CursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'CursorError';
    this.status = 400;
  }
}

/** A string naming the sort, so a cursor cannot be replayed against another one. */
const signature = (sort) => sort.map((s) => `${s.field}:${s.dir}`).join(',');

/** < 0 if a sorts before b under `sort`, > 0 if after, 0 if equal on every key. */
function compareKeys(a, b, sort) {
  for (let i = 0; i < sort.length; i++) {
    if (a[i] === b[i]) continue;
    const ascending = a[i] < b[i] ? -1 : 1;
    return sort[i].dir === 'desc' ? -ascending : ascending;
  }
  return 0;
}

const keyOf = (row, sort) => sort.map((s) => row[s.field]);

function encodeCursor(row, sort) {
  const payload = { s: signature(sort), k: keyOf(row, sort) };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor, sort) {
  let payload;
  try {
    if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new CursorError();
  }
  const valid =
    payload !== null &&
    typeof payload === 'object' &&
    payload.s === signature(sort) &&
    Array.isArray(payload.k) &&
    payload.k.length === sort.length &&
    payload.k.every((v) => typeof v === 'number' || typeof v === 'string');
  if (!valid) throw new CursorError();
  return payload.k;
}

export function paginate(rows, { sort, limit = 20, cursor } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit must be an integer from 1 to 100');
  }
  const after = cursor === undefined ? null : decodeCursor(cursor, sort);

  // A copy: sorting the caller's array in place reorders their data.
  const ordered = [...rows].sort((a, b) => compareKeys(keyOf(a, sort), keyOf(b, sort), sort));

  // Keyset: everything strictly after the cursor's values. The row the cursor
  // came from may be gone; the comparison does not care.
  const remaining = after ? ordered.filter((row) => compareKeys(keyOf(row, sort), after, sort) > 0) : ordered;

  // One extra row tells us whether there is a next page at all.
  const page = remaining.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;

  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1], sort) : null };
}
