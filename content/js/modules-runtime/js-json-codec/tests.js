const { encode, decode } = solution;

const roundTrip = (value) => decode(encode(value));

describe('plain JSON stays plain', () => {
  const payload = {
    id: 7,
    name: 'Ada "the first" Lovelace',
    tags: ['a', 'b'],
    address: { city: 'London', zip: null },
    active: true,
    score: -1.5,
    nested: [[1, 2], { deep: [{ x: 'y' }] }],
  };

  it('encodes exactly like JSON.stringify', () => {
    expect(encode(payload)).toBe(JSON.stringify(payload));
    expect(encode([1, 'two', null, false])).toBe(JSON.stringify([1, 'two', null, false]));
    expect(encode('text')).toBe('"text"');
    expect(encode(42)).toBe('42');
    expect(encode(null)).toBe('null');
  });

  it('decodes JSON from other systems like JSON.parse', () => {
    const text = JSON.stringify(payload);
    expect(decode(text)).toStrictEqual(JSON.parse(text));
  });

  it('keeps an own __proto__ key an own key', () => {
    const out = decode('{"__proto__": {"admin": true}, "name": "x"}');
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.admin).toBeUndefined();
    expect({}.admin).toBeUndefined();
  });
});

describe('special values survive a round trip', () => {
  it('Dates, including inside objects and arrays', () => {
    const placedAt = new Date('2024-03-10T12:30:00.000Z');
    const out = roundTrip({ order: { placedAt }, history: [new Date(0)] });
    expect(out.order.placedAt).toBeInstanceOf(Date);
    expect(out.order.placedAt.getTime()).toBe(placedAt.getTime());
    expect(out.history[0].getTime()).toBe(0);
  });

  it('an Invalid Date stays an Invalid Date', () => {
    const out = roundTrip({ when: new Date('not a date') });
    expect(out.when).toBeInstanceOf(Date);
    expect(Number.isNaN(out.when.getTime())).toBe(true);
  });

  it('Maps keep key types and order', () => {
    const key = { id: 1 };
    const m = new Map([[1, 'number one'], ['1', 'string one'], [key, new Date(5)], [null, [1, 2]]]);
    const out = roundTrip(m);
    expect(out).toBeInstanceOf(Map);
    expect([...out.keys()].map((k) => typeof k)).toEqual(['number', 'string', 'object', 'object']);
    expect(out.get(1)).toBe('number one');
    expect(out.get('1')).toBe('string one');
    const [, , [objKey, date], [nullKey, arr]] = [...out];
    expect(objKey).toEqual({ id: 1 });
    expect(date.getTime()).toBe(5);
    expect(nullKey).toBeNull();
    expect(arr).toEqual([1, 2]);
  });

  it('Sets, nested in Maps and objects', () => {
    const out = roundTrip({ perms: new Map([['ada', new Set(['read', 'write'])]]), empty: new Set() });
    expect(out.perms.get('ada')).toBeInstanceOf(Set);
    expect([...out.perms.get('ada')]).toEqual(['read', 'write']);
    expect(out.empty).toBeInstanceOf(Set);
    expect(out.empty.size).toBe(0);
  });

  it('BigInt', () => {
    const big = 2n ** 64n + 1n;
    expect(() => encode({ big })).not.toThrow();
    expect(roundTrip({ big }).big).toBe(big);
    expect(roundTrip([-5n])[0]).toBe(-5n);
  });

  it('NaN, Infinity and -Infinity', () => {
    const out = roundTrip({ a: NaN, b: Infinity, list: [-Infinity, 1] });
    expect(Number.isNaN(out.a)).toBe(true);
    expect(out.b).toBe(Infinity);
    expect(out.list).toEqual([-Infinity, 1]);
  });

  it('undefined as a property keeps the key', () => {
    const out = roundTrip({ note: undefined, n: 1 });
    expect(Object.keys(out)).toEqual(['note', 'n']);
    expect(out.note).toBeUndefined();
  });

  it('undefined in arrays and as the whole value', () => {
    const arr = roundTrip([1, undefined, 3]);
    expect(arr).toHaveLength(3);
    expect(1 in arr).toBe(true);
    expect(arr[1]).toBeUndefined();
    const whole = encode(undefined);
    expect(typeof whole).toBe('string');
    expect(roundTrip(undefined)).toBeUndefined();
  });

  it('the encoded form is valid JSON', () => {
    const text = encode({ d: new Date(1), m: new Map([[1, 2]]), s: new Set([1]), b: 1n, u: undefined, n: NaN });
    expect(typeof text).toBe('string');
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

describe('look-alikes are escaped', () => {
  // Whatever tag format you chose, one of these looks like it.
  const lookalikes = [
    { $type: 'Date', value: '2024-01-01T00:00:00.000Z' },
    { $type: 'Map', value: [] },
    { __type: 'Date', value: 0 },
    { _t: 'Date', v: '2024-01-01' },
    { t: 'd', v: '2024-01-01' },
    { $: 'Date', v: 0 },
    { '#': 'Set', v: [] },
    { type: 'undefined' },
    { $undefined: true },
    { $date: '2024-01-01T00:00:00.000Z' },
    { $bigint: '1' },
    { $map: [] },
  ];

  it('round-trips user objects that look like tags', () => {
    for (const obj of lookalikes) {
      const out = roundTrip(obj);
      expect(out).toStrictEqual(obj);
    }
  });

  it('also when nested among real special values', () => {
    const data = { form: { $type: 'Date', value: 'x' }, when: new Date(9), list: [{ $type: 'Set', value: [1] }, new Set([1])] };
    const out = roundTrip(data);
    expect(out.form).toStrictEqual({ $type: 'Date', value: 'x' });
    expect(out.when.getTime()).toBe(9);
    expect(out.list[0]).toStrictEqual({ $type: 'Set', value: [1] });
    expect(out.list[1]).toBeInstanceOf(Set);
  });
});

describe('toJSON', () => {
  it('uses toJSON() for other objects, like JSON.stringify', () => {
    class Money {
      constructor(cents) { this.cents = cents; this.secret = 'internal'; }
      toJSON() { return { cents: this.cents, currency: 'EUR' }; }
    }
    const out = roundTrip({ price: new Money(250) });
    expect(out.price).toStrictEqual({ cents: 250, currency: 'EUR' });
  });
});
