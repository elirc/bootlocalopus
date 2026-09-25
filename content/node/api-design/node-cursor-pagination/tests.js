const BY_PRICE = [{ field: 'price', dir: 'desc' }, { field: 'id', dir: 'asc' }];
const BY_NAME = [{ field: 'name', dir: 'asc' }, { field: 'id', dir: 'asc' }];

// Deliberately unsorted, with ties on price.
const products = () => [
  { id: 4, name: 'desk', price: 300 },
  { id: 1, name: 'apple', price: 100 },
  { id: 7, name: 'chair', price: 300 },
  { id: 2, name: 'bread', price: 250 },
  { id: 9, name: 'eraser', price: 100 },
  { id: 3, name: 'fan', price: 300 },
  { id: 5, name: 'glue', price: 50 },
];
// price desc, then id asc:
const PRICE_ORDER = [3, 4, 7, 2, 1, 9, 5];

const ids = (page) => page.items.map((r) => r.id);

/** Walks every page; returns the ids per page. */
function walk(rows, sort, limit) {
  const pages = [];
  let cursor;
  for (let guard = 0; guard < 50; guard++) {
    const page = solution.paginate(rows, { sort, limit, cursor });
    pages.push(ids(page));
    if (page.nextCursor === null) return pages;
    cursor = page.nextCursor;
  }
  return fail('pagination never ended');
}

function errorOf(run) {
  try {
    run();
  } catch (e) {
    return e;
  }
  return fail('expected a throw');
}

describe('pages', () => {
  it('returns the first page in sort order, ties broken by id', () => {
    const page = solution.paginate(products(), { sort: BY_PRICE, limit: 3 });
    expect(ids(page)).toEqual([3, 4, 7]);
    expect(typeof page.nextCursor).toBe('string');
  });

  it('walks every row exactly once across pages', () => {
    expect(walk(products(), BY_PRICE, 2)).toEqual([[3, 4], [7, 2], [1, 9], [5]]);
    expect(walk(products(), BY_NAME, 3)).toEqual([[1, 2, 7], [4, 9, 3], [5]]);
  });

  it('returns null, not a cursor to an empty page, when a page empties the list', () => {
    const rows = products().slice(0, 6);
    const first = solution.paginate(rows, { sort: BY_PRICE, limit: 3 });
    const second = solution.paginate(rows, { sort: BY_PRICE, limit: 3, cursor: first.nextCursor });
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    const all = solution.paginate(rows, { sort: BY_PRICE, limit: 6 });
    expect(all.nextCursor).toBeNull();
  });

  it('handles an empty table and the default limit', () => {
    expect(solution.paginate([], { sort: BY_PRICE })).toEqual({ items: [], nextCursor: null });
    const many = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: 'n' + i, price: i }));
    const page = solution.paginate(many, { sort: BY_PRICE });
    expect(page.items).toHaveLength(20);
    expect(page.items[0].id).toBe(25);
  });

  it('returns the rows themselves and leaves the input array alone', () => {
    const rows = products();
    const before = rows.map((r) => r.id);
    const page = solution.paginate(rows, { sort: BY_PRICE, limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(before);
    expect(page.items[0]).toBe(rows.find((r) => r.id === 3));
  });
});

describe('stability under writes', () => {
  it('does not repeat rows when new ones are inserted before the cursor', () => {
    const rows = products();
    const first = solution.paginate(rows, { sort: BY_PRICE, limit: 3 });
    expect(ids(first)).toEqual([3, 4, 7]);
    rows.push({ id: 10, name: 'hat', price: 999 }, { id: 11, name: 'ink', price: 300 });
    const second = solution.paginate(rows, { sort: BY_PRICE, limit: 3, cursor: first.nextCursor });
    expect(ids(second)).toEqual([11, 2, 1]);
  });

  it('does not skip rows when the last row the client saw is deleted', () => {
    let rows = products();
    const first = solution.paginate(rows, { sort: BY_PRICE, limit: 3 });
    rows = rows.filter((r) => r.id !== 7 && r.id !== 3);
    const second = solution.paginate(rows, { sort: BY_PRICE, limit: 3, cursor: first.nextCursor });
    expect(ids(second)).toEqual([2, 1, 9]);
  });
});

describe('the cursor', () => {
  it('is opaque and URL-safe', () => {
    const { nextCursor } = solution.paginate(products(), { sort: BY_NAME, limit: 1 });
    expect(nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects garbage with a CursorError', () => {
    const b64 = (v) => Buffer.from(v).toString('base64url');
    for (const bad of ['', 'abc', '!!!', '42', b64('{"nope":1}'), b64('null'), b64('[1,2]'), b64('"x"')]) {
      const e = errorOf(() => solution.paginate(products(), { sort: BY_PRICE, limit: 2, cursor: bad }));
      expect(e).toBeInstanceOf(solution.CursorError);
      expect(e.name).toBe('CursorError');
      expect(e.status).toBe(400);
      expect(e.message).toBe('invalid cursor');
    }
  });

  it('rejects a cursor minted for a different sort', () => {
    const byName = solution.paginate(products(), { sort: BY_NAME, limit: 2 });
    const e = errorOf(() => solution.paginate(products(), { sort: BY_PRICE, limit: 2, cursor: byName.nextCursor }));
    expect(e).toBeInstanceOf(solution.CursorError);
    const asc = [{ field: 'price', dir: 'asc' }, { field: 'id', dir: 'asc' }];
    const byPrice = solution.paginate(products(), { sort: BY_PRICE, limit: 2 });
    expect(errorOf(() => solution.paginate(products(), { sort: asc, limit: 2, cursor: byPrice.nextCursor })))
      .toBeInstanceOf(solution.CursorError);
  });
});

describe('limit', () => {
  it('must be an integer from 1 to 100', () => {
    for (const bad of [0, 101, 2.5, -1, '10', NaN]) {
      expect(errorOf(() => solution.paginate(products(), { sort: BY_PRICE, limit: bad }))).toBeInstanceOf(RangeError);
    }
    expect(solution.paginate(products(), { sort: BY_PRICE, limit: 100 }).items).toHaveLength(7);
    expect(solution.paginate(products(), { sort: BY_PRICE, limit: 1 }).items).toHaveLength(1);
  });
});
