const { prop, propEq, gte, lte, includesText, where, allOf, anyOf, not, fromQuery } = solution;

const rows = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', status: 'open', total: 0, owner: { name: 'sam' } },
  { id: 2, name: 'Grace Hopper', email: 'grace@navy.mil', status: 'paid', total: 250, owner: { name: 'kim' } },
  { id: 3, name: null, email: 'anon@example.com', status: 'open', total: 99.5, owner: null },
  { id: 4, name: 'Alan Turing', email: null, status: 'void', total: 1200, owner: { name: 'sam' }, deletedAt: '2024-01-01' },
  { id: 5, name: 'Edsger', status: 'paid', total: NaN },
];
const ids = (pred) => rows.filter(pred).map((r) => r.id);

describe('prop and propEq', () => {
  it('prop reads dotted paths and never throws on a missing link', () => {
    expect(prop('name')(rows[0])).toBe('Ada Lovelace');
    expect(prop('owner.name')(rows[1])).toBe('kim');
    expect(prop('owner.name')(rows[2])).toBeUndefined();
    expect(prop('owner.name')(rows[4])).toBeUndefined();
    expect(prop('a.b.c')(undefined)).toBeUndefined();
  });

  it('propEq takes both arguments at once', () => {
    expect(ids(propEq('status', 'open'))).toEqual([1, 3]);
    expect(ids(propEq('owner.name', 'sam'))).toEqual([1, 4]);
    expect(ids(propEq('total', '250'))).toEqual([]); // strict equality
  });

  it('propEq is curried: one argument returns a function waiting for the value', () => {
    const byStatus = propEq('status');
    expect(typeof byStatus).toBe('function');
    expect(ids(byStatus('paid'))).toEqual([2, 5]);
    const preds = ['open', 'void'].map(propEq('status'));
    expect(ids(anyOf(...preds))).toEqual([1, 3, 4]);
  });

  it('an explicit undefined is a value to compare against, not a missing argument', () => {
    const notDeleted = propEq('deletedAt', undefined);
    expect(typeof notDeleted(rows[0])).toBe('boolean');
    expect(ids(notDeleted)).toEqual([1, 2, 3, 5]);
  });
});

describe('value checks', () => {
  it('gte and lte accept numbers only', () => {
    expect([0, 99.5, 100, 250, null, '300', NaN, undefined].map(gte(100))).toEqual([false, false, true, true, false, false, false, false]);
    expect([0, 99.5, 100, 250, null, NaN].map(lte(100))).toEqual([true, true, true, false, false, false]);
  });

  it('includesText is case-insensitive, trims the query and rejects non-strings', () => {
    const ada = includesText('  ADA ');
    expect(ada('Ada Lovelace')).toBe(true);
    expect(ada('nevada')).toBe(true);
    expect(ada('Grace')).toBe(false);
    expect(ada(null)).toBe(false);
    expect(ada(42)).toBe(false);
  });

  it('an empty or blank query matches everything', () => {
    for (const q of ['', '   ', undefined]) {
      const pred = includesText(q);
      expect([pred('x'), pred(null), pred(undefined)]).toEqual([true, true, true]);
    }
  });
});

describe('where and combinators', () => {
  it('where mixes literal values and predicate functions', () => {
    expect(ids(where({ status: 'open', total: gte(50) }))).toEqual([3]);
    expect(ids(where({ 'owner.name': 'sam', total: lte(10) }))).toEqual([1]);
    expect(ids(where({}))).toEqual([1, 2, 3, 4, 5]);
  });

  it('where passes the value at the path to a predicate', () => {
    const seen = [];
    where({ 'owner.name': (v) => { seen.push(v); return true; } })(rows[1]);
    expect(seen).toEqual(['kim']);
  });

  it('allOf, anyOf and not', () => {
    expect(ids(allOf(propEq('status', 'paid'), where({ total: gte(100) })))).toEqual([2]);
    expect(ids(anyOf(propEq('id', 1), propEq('id', 4)))).toEqual([1, 4]);
    expect(ids(not(propEq('status', 'open')))).toEqual([2, 4, 5]);
    expect(ids(allOf())).toEqual([1, 2, 3, 4, 5]);
    expect(ids(anyOf())).toEqual([]);
  });

  it('predicates return booleans', () => {
    for (const pred of [propEq('status', 'open'), where({ total: gte(1) }), allOf(), anyOf(), not(allOf())]) {
      expect(typeof pred(rows[0])).toBe('boolean');
    }
  });
});

describe('fromQuery', () => {
  it('an empty query matches everything', () => {
    expect(ids(fromQuery({}))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(fromQuery({ status: '', q: '', minTotal: '', owner: '' }))).toEqual([1, 2, 3, 4, 5]);
  });

  it('status is a comma-separated list', () => {
    expect(ids(fromQuery({ status: 'open' }))).toEqual([1, 3]);
    expect(ids(fromQuery({ status: 'open,void' }))).toEqual([1, 3, 4]);
  });

  it('q searches name or email, and survives null fields', () => {
    expect(ids(fromQuery({ q: 'example' }))).toEqual([1, 3]);
    expect(ids(fromQuery({ q: 'TURING ' }))).toEqual([4]);
    expect(ids(fromQuery({ q: '   ' }))).toEqual([1, 2, 3, 4, 5]);
  });

  it('minTotal and maxTotal are inclusive numeric bounds; 0 counts, blanks and junk do not', () => {
    expect(ids(fromQuery({ minTotal: '100' }))).toEqual([2, 4]);
    expect(ids(fromQuery({ maxTotal: '0' }))).toEqual([1]);
    expect(ids(fromQuery({ minTotal: '99.5', maxTotal: '250' }))).toEqual([2, 3]);
    expect(ids(fromQuery({ minTotal: 'abc' }))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(fromQuery({ maxTotal: ' ' }))).toEqual([1, 2, 3, 4, 5]);
  });

  it('owner matches owner.name; conditions combine; unknown keys are ignored', () => {
    expect(ids(fromQuery({ owner: 'sam' }))).toEqual([1, 4]);
    expect(ids(fromQuery({ owner: 'sam', status: 'open,void', minTotal: '1', sort: 'name' }))).toEqual([4]);
  });
});
