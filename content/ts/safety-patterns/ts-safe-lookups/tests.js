const { lookup, countBy, groupBy, getPath } = solution;

const own = (obj, key) => Object.getOwnPropertyDescriptor(obj, key)?.value;

describe('lookup', () => {
  const prices = { apple: 120, pear: 90 };

  it('finds own keys', () => {
    expect(lookup(prices, 'apple')).toBe(120);
  });

  it('returns undefined for a missing key', () => {
    expect(lookup(prices, 'plum')).toBeUndefined();
  });

  it('never returns something inherited from Object.prototype', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
      expect(lookup(prices, key)).toBeUndefined();
    }
  });

  it('ignores keys inherited from any prototype', () => {
    const table = Object.create({ inherited: 1 });
    table.mine = 2;
    expect(lookup(table, 'inherited')).toBeUndefined();
    expect(lookup(table, 'mine')).toBe(2);
  });

  it('works on a null-prototype table', () => {
    const table = Object.create(null);
    table.x = 'y';
    expect(lookup(table, 'x')).toBe('y');
    expect(lookup(table, 'toString')).toBeUndefined();
  });
});

describe('countBy', () => {
  it('counts per key', () => {
    const counts = countBy(['a', 'b', 'a', 'c', 'a'], (x) => x);
    expect(own(counts, 'a')).toBe(3);
    expect(own(counts, 'b')).toBe(1);
    expect(Object.keys(counts).sort()).toEqual(['a', 'b', 'c']);
  });

  it('counts keys that collide with Object.prototype like any others', () => {
    const counts = countBy(['constructor', 'toString', 'constructor', 'valueOf'], (x) => x);
    expect(own(counts, 'constructor')).toBe(2);
    expect(own(counts, 'toString')).toBe(1);
    expect(own(counts, 'valueOf')).toBe(1);
  });

  it('stores __proto__ as an ordinary key instead of replacing the prototype', () => {
    const counts = countBy(['__proto__', '__proto__', 'x'], (x) => x);
    expect(own(counts, '__proto__')).toBe(2);
    expect(own(counts, 'x')).toBe(1);
    expect(Object.keys(counts).sort()).toEqual(['__proto__', 'x']);
  });

  it('uses the key function and accepts any iterable', () => {
    const words = new Set(['apple', 'avocado', 'banana']);
    const counts = countBy(words, (w) => w[0]);
    expect(own(counts, 'a')).toBe(2);
    expect(own(counts, 'b')).toBe(1);
  });

  it('returns an empty result for no items', () => {
    expect(Object.keys(countBy([], (x) => x))).toEqual([]);
  });
});

describe('groupBy', () => {
  it('groups into a Map in first-seen order, keeping item order', () => {
    const orders = [
      { id: 1, status: 'paid' },
      { id: 2, status: 'open' },
      { id: 3, status: 'paid' },
    ];
    const groups = groupBy(orders, (o) => o.status);
    expect(groups).toBeInstanceOf(Map);
    expect([...groups.keys()]).toEqual(['paid', 'open']);
    expect(groups.get('paid').map((o) => o.id)).toEqual([1, 3]);
  });

  it('handles awkward keys, including non-strings', () => {
    const groups = groupBy(['constructor', '__proto__', 'constructor'], (x) => x);
    expect(groups.get('constructor')).toHaveLength(2);
    expect(groups.get('__proto__')).toHaveLength(1);
    const byLength = groupBy(['a', 'bb', 'cc'], (s) => s.length);
    expect(byLength.get(2)).toEqual(['bb', 'cc']);
    expect(byLength.get('2')).toBeUndefined();
  });
});

describe('getPath', () => {
  const order = {
    id: 'o1',
    billing: { address: { city: 'Wellington', zip: '6011' } },
    lines: [{ sku: 'a' }, { sku: 'b' }],
    note: null,
    zero: 0,
  };

  it('reads nested own properties', () => {
    expect(getPath(order, 'id')).toBe('o1');
    expect(getPath(order, 'billing.address.city')).toBe('Wellington');
    expect(getPath(order, 'billing.address')).toEqual({ city: 'Wellington', zip: '6011' });
  });

  it('reads array indexes as path segments', () => {
    expect(getPath(order, 'lines.1.sku')).toBe('b');
    expect(getPath(order, 'lines.5.sku')).toBeUndefined();
  });

  it('returns falsy values that are really there', () => {
    expect(getPath(order, 'note')).toBeNull();
    expect(getPath(order, 'zero')).toBe(0);
  });

  it('returns undefined for missing segments and for stepping through primitives or null', () => {
    expect(getPath(order, 'billing.phone')).toBeUndefined();
    expect(getPath(order, 'note.text')).toBeUndefined();
    expect(getPath(order, 'id.length')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
    expect(getPath('text', 'length')).toBeUndefined();
  });

  it('never walks into prototypes', () => {
    expect(getPath(order, 'constructor')).toBeUndefined();
    expect(getPath(order, 'constructor.constructor')).toBeUndefined();
    expect(getPath(order, '__proto__')).toBeUndefined();
    expect(getPath(order, 'billing.toString')).toBeUndefined();
    expect(getPath(order, 'lines.map')).toBeUndefined();
    expect(getPath(order, 'lines.length')).toBe(2);
  });
});
