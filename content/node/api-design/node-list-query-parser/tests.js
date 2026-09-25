const schema = {
  filters: {
    status: { type: 'string', ops: ['eq', 'in'] },
    price: { type: 'integer', ops: ['eq', 'gte', 'lte'] },
    active: { type: 'boolean' },
  },
  sortable: ['price', 'name', 'createdAt'],
  defaultSort: '-createdAt',
};

const parse = (q) => solution.parseListQuery(q, schema);

/** The QueryError thrown by parsing `q`, or a test failure. */
function errorOf(q) {
  try {
    parse(q);
  } catch (e) {
    return e;
  }
  return fail('expected parseListQuery(' + JSON.stringify(q) + ') to throw');
}

describe('filters', () => {
  it('parses the example from the brief', () => {
    expect(parse('?price[gte]=10&status[in]=open,held&sort=-price')).toStrictEqual({
      filters: [
        { field: 'price', op: 'gte', value: 10 },
        { field: 'status', op: 'in', value: ['open', 'held'] },
      ],
      sort: [{ field: 'price', dir: 'desc' }, { field: 'id', dir: 'asc' }],
    });
  });

  it('treats a bare key as eq, and accepts an explicit [eq]', () => {
    expect(parse('status=open&price[eq]=5').filters).toStrictEqual([
      { field: 'status', op: 'eq', value: 'open' },
      { field: 'price', op: 'eq', value: 5 },
    ]);
  });

  it('accepts URLSearchParams as well as a string without "?"', () => {
    const params = new URLSearchParams([['active', 'false'], ['price[lte]', '-3']]);
    expect(parse(params).filters).toStrictEqual([
      { field: 'active', op: 'eq', value: false },
      { field: 'price', op: 'lte', value: -3 },
    ]);
    expect(parse('active=true').filters).toStrictEqual([{ field: 'active', op: 'eq', value: true }]);
  });

  it('converts every item of an in-list', () => {
    const s = { filters: { price: { type: 'integer', ops: ['in'] } }, sortable: [] };
    expect(solution.parseListQuery('price[in]=1,20,300', s).filters).toStrictEqual([
      { field: 'price', op: 'in', value: [1, 20, 300] },
    ]);
  });

  it('ignores pagination keys', () => {
    expect(parse('limit=5&offset=10&cursor=abc&status=open').filters).toStrictEqual([
      { field: 'status', op: 'eq', value: 'open' },
    ]);
  });

  it('keeps an empty query empty', () => {
    expect(parse('').filters).toStrictEqual([]);
  });
});

describe('sort', () => {
  it('parses several fields with directions and appends the id tiebreaker', () => {
    expect(parse('sort=-price,name').sort).toStrictEqual([
      { field: 'price', dir: 'desc' },
      { field: 'name', dir: 'asc' },
      { field: 'id', dir: 'asc' },
    ]);
  });

  it('uses the default sort when none is given', () => {
    expect(parse('status=open').sort).toStrictEqual([
      { field: 'createdAt', dir: 'desc' },
      { field: 'id', dir: 'asc' },
    ]);
  });

  it('does not add a second id when the sort already has one', () => {
    const s = { ...schema, sortable: ['name', 'id'] };
    expect(solution.parseListQuery('sort=-id', s).sort).toStrictEqual([{ field: 'id', dir: 'desc' }]);
    expect(solution.parseListQuery('sort=id,name', s).sort).toStrictEqual([
      { field: 'id', dir: 'asc' },
      { field: 'name', dir: 'asc' },
    ]);
  });

  it('falls back to just the tiebreaker with no default', () => {
    const s = { filters: {}, sortable: ['name'] };
    expect(solution.parseListQuery('', s).sort).toStrictEqual([{ field: 'id', dir: 'asc' }]);
  });
});

describe('errors', () => {
  it('is a QueryError with status 400 and details', () => {
    const e = errorOf('bogus=1');
    expect(e).toBeInstanceOf(solution.QueryError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('QueryError');
    expect(e.status).toBe(400);
    expect(e.message).toBe('invalid query');
    expect(Object.keys(e.details)).toEqual(['bogus']);
    expect(typeof e.details.bogus).toBe('string');
    expect(e.details.bogus.length).toBeGreaterThan(0);
  });

  it('rejects an op the field does not allow, keyed by the raw key', () => {
    expect(Object.keys(errorOf('status[gte]=a').details)).toEqual(['status[gte]']);
    expect(Object.keys(errorOf('active[in]=true').details)).toEqual(['active[in]']);
    expect(Object.keys(errorOf('price[drop]=1').details)).toEqual(['price[drop]']);
  });

  it('does not treat inherited object keys as fields', () => {
    expect(Object.keys(errorOf('constructor=1&toString=2').details).sort()).toEqual(['constructor', 'toString']);
  });

  it('rejects integers that are only partly numeric, decimal or unsafe', () => {
    for (const bad of ['12abc', '1.5', ' 7', '', '1e3', '9007199254740993']) {
      const e = errorOf('price=' + encodeURIComponent(bad));
      expect(Object.keys(e.details)).toEqual(['price']);
    }
  });

  it('rejects booleans other than true and false', () => {
    for (const bad of ['1', 'yes', 'TRUE', '']) {
      expect(Object.keys(errorOf('active=' + bad).details)).toEqual(['active']);
    }
  });

  it('rejects an empty string value and an empty in-list item', () => {
    expect(Object.keys(errorOf('status=').details)).toEqual(['status']);
    expect(Object.keys(errorOf('status[in]=a,,b').details)).toEqual(['status[in]']);
    expect(Object.keys(errorOf('status[in]=').details)).toEqual(['status[in]']);
  });

  it('rejects a repeated key instead of silently taking the first', () => {
    expect(Object.keys(errorOf('status=open&status=closed').details)).toEqual(['status']);
    expect(Object.keys(errorOf('sort=name&sort=price').details)).toEqual(['sort']);
  });

  it('rejects unsortable, repeated and empty sort fields', () => {
    for (const bad of ['secret', 'name,-name', 'name,', '-', 'id']) {
      expect(Object.keys(errorOf('sort=' + bad).details)).toEqual(['sort']);
    }
  });

  it('collects every problem into one error', () => {
    const e = errorOf('price=abc&bogus=1&sort=nope&status=ok&active=maybe');
    expect(Object.keys(e.details).sort()).toEqual(['active', 'bogus', 'price', 'sort']);
  });
});
