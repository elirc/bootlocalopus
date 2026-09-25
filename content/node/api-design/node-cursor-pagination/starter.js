export class CursorError extends Error {
  constructor() {
    super('invalid cursor');
    // TODO: name, status
  }
}

export function paginate(rows, { sort, limit = 20, cursor } = {}) {
  // TODO: replace this offset "cursor" with a keyset one.
  // It breaks as soon as a row is inserted or deleted between two pages,
  // it trusts whatever the client sends, and it ignores `sort` entirely.
  const offset = cursor ? Number(cursor) : 0;
  const items = rows.slice(offset, offset + limit);
  return { items, nextCursor: String(offset + limit) };
}
