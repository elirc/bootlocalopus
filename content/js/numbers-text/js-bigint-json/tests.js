const { parseJson, stringifyJson, compareIds } = solution;

describe('parseJson', () => {
  it('keeps a 64-bit id exact as a BigInt', () => {
    const out = parseJson('{"id": 1283465098712340481, "amount": 1999}');
    expect(out.id).toBe(1283465098712340481n);
    expect(out.amount).toBe(1999);
  });

  it('leaves safe integers as Numbers, including the boundary', () => {
    const out = parseJson('[9007199254740991, -9007199254740991, 0, -0, 42]');
    expect(out.map((v) => typeof v)).toEqual(['number', 'number', 'number', 'number', 'number']);
    expect(out[0]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('turns the first unsafe integers into BigInts, negatives too', () => {
    expect(parseJson('9007199254740992')).toBe(9007199254740992n);
    expect(parseJson('9007199254740993')).toBe(9007199254740993n);
    expect(parseJson('-9007199254740993')).toBe(-9007199254740993n);
  });

  it('works at any depth, including inside arrays', () => {
    const out = parseJson('{"a":{"b":[1,{"c":18446744073709551615}]},"d":[12345678901234567890]}');
    expect(out.a.b[1].c).toBe(18446744073709551615n);
    expect(out.d[0]).toBe(12345678901234567890n);
    expect(out.a.b[0]).toBe(1);
  });

  it('leaves non-integer literals as Numbers', () => {
    const out = parseJson('[1.5, 1e21, 12345678901234567890.5, 1.5e300]');
    expect(out.every((v) => typeof v === 'number')).toBe(true);
    expect(out[1]).toBe(1e21);
  });

  it('never touches digits inside strings', () => {
    const out = parseJson('{"note":"id 12345678901234567890","raw":"12345678901234567890"}');
    expect(out.note).toBe('id 12345678901234567890');
    expect(out.raw).toBe('12345678901234567890');
  });

  it('otherwise behaves like JSON.parse', () => {
    const text = '{"s":"x","t":true,"n":null,"arr":[],"o":{"k":[1,2]}}';
    expect(parseJson(text)).toEqual(JSON.parse(text));
    expect(() => parseJson('{"a": 1,}')).toThrow(SyntaxError);
    expect(() => parseJson('')).toThrow(SyntaxError);
  });
});

describe('stringifyJson', () => {
  it('writes BigInts as unquoted JSON numbers', () => {
    expect(stringifyJson({ id: 12345678901234567890n, n: 1 })).toBe('{"id":12345678901234567890,"n":1}');
    expect(stringifyJson([1n, -2n, 0n])).toBe('[1,-2,0]');
    expect(stringifyJson(9007199254740993n)).toBe('9007199254740993');
  });

  it('otherwise behaves like JSON.stringify', () => {
    const v = { s: 'x', n: 1.5, u: undefined, f() {}, d: new Date(0), nested: [null, true, { a: 'b' }] };
    expect(stringifyJson(v)).toBe(JSON.stringify(v));
  });

  it('does not patch BigInt.prototype or leave globals behind', () => {
    stringifyJson({ id: 1n });
    expect(Object.hasOwn(BigInt.prototype, 'toJSON')).toBe(false);
    expect(() => JSON.stringify({ id: 1n })).toThrow(TypeError);
  });

  it('round-trips through parseJson', () => {
    const original = { id: 1283465098712340481n, parent: { id: 1283465098712340480n }, ids: [18446744073709551615n, 7], label: '12345678901234567890' };
    const back = parseJson(stringifyJson(original));
    expect(back).toEqual(original);
    expect(back.parent.id).toBe(1283465098712340480n);
  });
});

describe('compareIds', () => {
  it('compares numerically, not as text', () => {
    expect(compareIds('9', '10')).toBe(-1);
    expect(compareIds('10', '9')).toBe(1);
    expect(compareIds('123', '123')).toBe(0);
  });

  it('is exact for 64-bit ids', () => {
    expect(compareIds('1283465098712340481', '1283465098712340480')).toBe(1);
    expect(compareIds('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareIds('18446744073709551615', '18446744073709551615')).toBe(0);
  });

  it('can be used to sort ids', () => {
    const ids = ['1283465098712340481', '99', '1283465098712340480', '100', '9007199254740993'];
    expect(ids.toSorted(compareIds)).toEqual(['99', '100', '9007199254740993', '1283465098712340480', '1283465098712340481']);
  });

  it('rejects anything that is not a string of digits', () => {
    for (const bad of ['', ' ', '12a', '-5', '1.5', '0x1f', ' 12', 12, 12n, null]) {
      expect(() => compareIds(bad, '1')).toThrow(TypeError);
      expect(() => compareIds('1', bad)).toThrow(TypeError);
    }
  });
});
