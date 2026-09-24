const { string, number, boolean, optional, arrayOf, object, ValidationError } = solution;

describe('leaf validators', () => {
  it('passes matching values through', () => {
    expect(string().parse('hi')).toBe('hi');
    expect(number().parse(42)).toBe(42);
    expect(boolean().parse(false)).toBe(false);
  });
  it('throws ValidationError with a useful message', () => {
    let caught;
    try { number().parse('42'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught.message).toBe('expected number at value, got string');
  });
  it('reports null distinctly from object', () => {
    let caught;
    try { string().parse(null); } catch (e) { caught = e; }
    expect(caught.message).toContain('got null');
  });
});

describe('object', () => {
  const User = object({ id: number(), name: string() });

  it('parses a valid object', () => {
    expect(User.parse({ id: 1, name: 'ada' })).toEqual({ id: 1, name: 'ada' });
  });
  it('reports the failing key in the path', () => {
    let caught;
    try { User.parse({ id: 1, name: 42 }); } catch (e) { caught = e; }
    expect(caught.message).toBe('expected string at name, got number');
    expect(caught.path).toBe('name');
  });
  it('reports a missing key', () => {
    let caught;
    try { User.parse({ id: 1 }); } catch (e) { caught = e; }
    expect(caught.path).toBe('name');
    expect(caught.message).toContain('got undefined');
  });
  it('rejects a non-object', () => {
    expect(() => User.parse('nope')).toThrow('expected object at value, got string');
    expect(() => User.parse([])).toThrow('got array');
    expect(() => User.parse(null)).toThrow('got null');
  });
  it('rejects extra keys', () => {
    let caught;
    try { User.parse({ id: 1, name: 'ada', isAdmin: true }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught.path).toBe('isAdmin');
  });
  it('rejects extra keys named like Object.prototype members', () => {
    // JSON.parse creates an own "__proto__" key, exactly as res.json() would.
    const payloads = [
      { id: 1, name: 'ada', constructor: 'x' },
      { id: 1, name: 'ada', toString: 'x' },
      { id: 1, name: 'ada', hasOwnProperty: 'x' },
      JSON.parse('{"id":1,"name":"ada","__proto__":{"isAdmin":true}}'),
    ];
    for (const payload of payloads) {
      const extraKey = Object.keys(payload)[2];
      let caught;
      try { User.parse(payload); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(ValidationError);
      expect(caught.path).toBe(extraKey);
    }
  });
  it('does not read a missing key from the prototype', () => {
    const Tagged = object({ toString: optional(string()) });
    expect(Tagged.parse({})).toEqual({});
  });
  it('reports the first failure in declaration order', () => {
    let caught;
    try { User.parse({ id: 'no', name: 42 }); } catch (e) { caught = e; }
    expect(caught.path).toBe('id');
  });
});

describe('optional', () => {
  const User = object({ id: number(), nickname: optional(string()) });
  it('allows the key to be missing', () => {
    expect(User.parse({ id: 1 })).toEqual({ id: 1 });
  });
  it('still validates a present value', () => {
    expect(User.parse({ id: 1, nickname: 'ada' })).toEqual({ id: 1, nickname: 'ada' });
    expect(() => User.parse({ id: 1, nickname: 9 })).toThrow('expected string at nickname');
  });
});

describe('arrayOf', () => {
  it('validates every element', () => {
    expect(arrayOf(number()).parse([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('reports the failing index', () => {
    let caught;
    try { arrayOf(number()).parse([1, 'two', 3]); } catch (e) { caught = e; }
    expect(caught.path).toBe('1');
    expect(caught.message).toBe('expected number at 1, got string');
  });
  it('rejects a non-array', () => {
    expect(() => arrayOf(number()).parse({})).toThrow('expected array at value, got object');
  });
  it('accepts an empty array', () => {
    expect(arrayOf(string()).parse([])).toEqual([]);
  });
});

describe('nesting', () => {
  const Payload = object({
    user: object({
      id: number(),
      name: string(),
      tags: arrayOf(string()),
    }),
    count: number(),
  });

  it('parses a realistic payload', () => {
    const input = { user: { id: 1, name: 'ada', tags: ['admin', 'beta'] }, count: 2 };
    expect(Payload.parse(input)).toEqual(input);
  });

  it('builds a dotted path through objects and arrays', () => {
    let caught;
    try {
      Payload.parse({ user: { id: 1, name: 'ada', tags: ['ok', 7] }, count: 2 });
    } catch (e) { caught = e; }
    expect(caught.path).toBe('user.tags.1');
    expect(caught.message).toBe('expected string at user.tags.1, got number');
  });

  it('reports a deep missing field', () => {
    let caught;
    try { Payload.parse({ user: { id: 1, tags: [] }, count: 2 }); } catch (e) { caught = e; }
    expect(caught.path).toBe('user.name');
  });
});