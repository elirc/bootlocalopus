const { parseListQuery, toQueryString } = solution;

const DEFAULT = { page: 1, limit: 20, sort: { field: 'createdAt', direction: 'desc' }, status: [], q: undefined };

function ok(input) {
  const r = parseListQuery(input);
  if (!r.ok) throw new Error('expected ok, got ' + JSON.stringify(r.errors));
  return r.value;
}
function errors(input) {
  const r = parseListQuery(input);
  if (r.ok) throw new Error('expected errors, got ' + JSON.stringify(r.value));
  return r.errors;
}

describe('parseListQuery', () => {
  it('gives the defaults for an empty query', () => {
    expect(parseListQuery('')).toStrictEqual({ ok: true, value: DEFAULT });
  });
  it('accepts a URLSearchParams as well as a string, with or without the leading ?', () => {
    expect(ok(new URLSearchParams('page=2')).page).toBe(2);
    expect(ok('?page=3').page).toBe(3);
  });
  it('parses every parameter', () => {
    expect(ok('page=4&limit=50&sort=total&status=open&q=blue%20mug')).toStrictEqual({
      page: 4, limit: 50, sort: { field: 'total', direction: 'asc' }, status: ['open'], q: 'blue mug',
    });
  });
  it('reads a leading - as descending', () => {
    expect(ok('sort=-total').sort).toEqual({ field: 'total', direction: 'desc' });
    expect(ok('sort=createdAt').sort).toEqual({ field: 'createdAt', direction: 'asc' });
  });
  it('clamps a large limit instead of rejecting it', () => {
    expect(ok('limit=500').limit).toBe(100);
    expect(ok('limit=100').limit).toBe(100);
  });
  it('accepts repeated and comma-separated statuses, deduplicated in first-seen order', () => {
    expect(ok('status=paid&status=open,paid&status=shipped').status).toEqual(['paid', 'open', 'shipped']);
    expect(ok('status=open,,').status).toEqual(['open']);
  });
  it('trims q and treats blank as absent', () => {
    expect(ok('q=%20%20mug%20').q).toBe('mug');
    expect(ok('q=%20%20').q).toBeUndefined();
    expect(ok('q=').q).toBeUndefined();
  });
  it('treats an empty scalar as absent', () => {
    expect(ok('page=&limit=&sort=')).toStrictEqual(DEFAULT);
  });
  it('ignores unknown parameters', () => {
    expect(ok('utm_source=mail&page=2').page).toBe(2);
  });
});

describe('invalid input', () => {
  it('rejects pages and limits that are not positive integers', () => {
    for (const bad of ['0', '-1', '1.5', 'abc', '2x', '1e2']) {
      expect(errors('page=' + bad)).toEqual([{ param: 'page', message: 'must be a positive integer' }]);
    }
    expect(errors('limit=0')).toEqual([{ param: 'limit', message: 'must be a positive integer' }]);
  });
  it('rejects an unknown sort field', () => {
    expect(errors('sort=-price')).toEqual([{ param: 'sort', message: 'must be one of createdAt, total, status' }]);
    expect(errors('sort=-')).toEqual([{ param: 'sort', message: 'must be one of createdAt, total, status' }]);
  });
  it('reports each unknown status', () => {
    expect(errors('status=open,lost&status=gone')).toEqual([
      { param: 'status', message: 'unknown value "lost"' },
      { param: 'status', message: 'unknown value "gone"' },
    ]);
  });
  it('rejects a scalar given twice instead of silently taking the first', () => {
    expect(errors('page=1&page=2')).toEqual([{ param: 'page', message: 'must be given once' }]);
    expect(errors('sort=total&sort=-total')).toEqual([{ param: 'sort', message: 'must be given once' }]);
  });
  it('limits the length of q', () => {
    expect(ok('q=' + 'a'.repeat(100)).q).toHaveLength(100);
    expect(errors('q=' + 'a'.repeat(101))).toEqual([{ param: 'q', message: 'must be at most 100 characters' }]);
  });
  it('collects every error in parameter order', () => {
    expect(errors('q=' + 'x'.repeat(101) + '&status=nope&sort=price&limit=none&page=0')).toEqual([
      { param: 'page', message: 'must be a positive integer' },
      { param: 'limit', message: 'must be a positive integer' },
      { param: 'sort', message: 'must be one of createdAt, total, status' },
      { param: 'status', message: 'unknown value "nope"' },
      { param: 'q', message: 'must be at most 100 characters' },
    ]);
  });
  it('does not treat inherited property names as allowed values', () => {
    expect(errors('sort=constructor')).toEqual([{ param: 'sort', message: 'must be one of createdAt, total, status' }]);
    expect(errors('status=toString')).toEqual([{ param: 'status', message: 'unknown value "toString"' }]);
  });
});

describe('toQueryString', () => {
  it('is empty for the defaults', () => {
    expect(toQueryString(DEFAULT)).toBe('');
  });
  it('writes only what differs from the defaults, in a fixed order', () => {
    expect(toQueryString({ ...DEFAULT, q: 'blue mug', status: ['open', 'paid'], page: 2 }))
      .toBe('page=2&status=open&status=paid&q=blue+mug');
    expect(toQueryString({ ...DEFAULT, sort: { field: 'total', direction: 'desc' }, limit: 50 }))
      .toBe('limit=50&sort=-total');
    expect(toQueryString({ ...DEFAULT, sort: { field: 'createdAt', direction: 'asc' } })).toBe('sort=createdAt');
  });
  it('round-trips through parseListQuery', () => {
    const queries = [
      DEFAULT,
      { page: 3, limit: 5, sort: { field: 'status', direction: 'asc' }, status: ['cancelled'], q: 'a&b=c' },
      { ...DEFAULT, q: '100% cotton', status: ['shipped', 'open'] },
    ];
    for (const query of queries) {
      expect(parseListQuery(toQueryString(query))).toStrictEqual({ ok: true, value: query });
    }
  });
});
