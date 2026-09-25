const { like, eachLike, term, verify } = solution;

// What the mobile app reads from GET /orders/:id.
const orderContract = () => ({
  id: term(/^ord_[0-9]+$/, 'ord_1'),
  status: 'paid',
  totalCents: like(4500),
  customer: like({ id: 'cus_1', email: 'a@example.com' }),
  lines: eachLike({ sku: 'MUG', qty: 1 }),
});

const goodOrder = () => ({
  id: 'ord_812',
  status: 'paid',
  totalCents: 12990,
  currency: 'GBP',
  customer: { id: 'cus_77', email: 'kim@example.com', marketingOptIn: true },
  lines: [{ sku: 'TEE', qty: 3, colour: 'red' }, { sku: 'HAT', qty: 1 }],
});

describe('verify: passing responses', () => {
  it('accepts a response that satisfies the contract', () => {
    expect(verify(orderContract(), goodOrder())).toEqual([]);
  });

  it('ignores fields the consumer does not read (additive changes are safe)', () => {
    const body = { ...goodOrder(), shippedAt: '2024-05-01', internalNotes: 'x' };
    expect(verify(orderContract(), body)).toEqual([]);
  });

  it('matches `like` by type, not by value, all the way down', () => {
    expect(verify(like({ n: 1, s: 'a', b: true, nested: { deep: 'x' } }), { n: 99, s: 'zzz', b: false, nested: { deep: 'y' } })).toEqual([]);
  });
});

describe('verify: literals and types', () => {
  it('requires a literal outside `like` to be exactly equal', () => {
    expect(verify(orderContract(), { ...goodOrder(), status: 'pending' })).toEqual(['$.status: expected "paid", got "pending"']);
  });

  it('reports a type change inside `like`', () => {
    expect(verify(orderContract(), { ...goodOrder(), totalCents: '129.90' })).toEqual(['$.totalCents: expected number, got string']);
  });

  it('names null and arrays as their own types', () => {
    expect(verify(like({ a: 'x', b: 'y', c: {} }), { a: null, b: ['y'], c: [] })).toEqual([
      '$.a: expected string, got null',
      '$.b: expected string, got array',
      '$.c: expected object, got array',
    ]);
    expect(verify(like({ deletedAt: null }), { deletedAt: '2024-01-01' })).toEqual(['$.deletedAt: expected null, got string']);
  });

  it('reports missing keys with their full path', () => {
    const body = goodOrder();
    delete body.customer.email;
    expect(verify(orderContract(), body)).toEqual(['$.customer.email: missing']);
  });

  it('treats a key that is present but undefined as present', () => {
    expect(verify({ a: like(1), b: like('x') }, { a: undefined })).toEqual(['$.a: expected number, got undefined', '$.b: missing']);
  });

  it('reports a whole body of the wrong type at $', () => {
    expect(verify(orderContract(), null)).toEqual(['$: expected object, got null']);
  });
});

describe('verify: term', () => {
  it('reports a string that does not match the pattern', () => {
    expect(verify(orderContract(), { ...goodOrder(), id: 'ORD-812' })).toEqual(['$.id: "ORD-812" does not match /^ord_[0-9]+$/']);
  });

  it('reports a non-string where a term is expected', () => {
    expect(verify(orderContract(), { ...goodOrder(), id: 812 })).toEqual(['$.id: expected string, got number']);
  });
});

describe('verify: arrays', () => {
  it('checks every item of an eachLike array, with its index in the path', () => {
    const body = { ...goodOrder(), lines: [{ sku: 'TEE', qty: 3 }, { sku: 'HAT', qty: '1' }, { qty: 2 }] };
    expect(verify(orderContract(), body)).toEqual([
      '$.lines[1].qty: expected number, got string',
      '$.lines[2].sku: missing',
    ]);
  });

  it('enforces the minimum length of eachLike', () => {
    expect(verify(orderContract(), { ...goodOrder(), lines: [] })).toEqual(['$.lines: expected at least 1 item(s), got 0']);
    expect(verify({ tags: eachLike('x', { min: 2 }) }, { tags: ['a'] })).toEqual(['$.tags: expected at least 2 item(s), got 1']);
    expect(verify({ tags: eachLike('x', { min: 0 }) }, { tags: [] })).toEqual([]);
  });

  it('matches an array literal item by item, with the same length', () => {
    expect(verify({ pair: [1, 'a'] }, { pair: [1, 'a'] })).toEqual([]);
    expect(verify({ pair: [1, 'a'] }, { pair: [1, 'b'] })).toEqual(['$.pair[1]: expected "a", got "b"']);
    expect(verify({ pair: [1, 'a'] }, { pair: [1, 'a', 2] })).toEqual(['$.pair: expected 2 item(s), got 3']);
    expect(verify({ pair: like([1, 'a']) }, { pair: [7, 'z'] })).toEqual([]);
  });

  it('reports a non-array where eachLike is expected', () => {
    expect(verify(orderContract(), { ...goodOrder(), lines: { sku: 'TEE', qty: 1 } })).toEqual(['$.lines: expected array, got object']);
  });
});

describe('verify: many problems at once', () => {
  it('reports every mismatch, in the order of the contract', () => {
    const body = { id: 'x', status: 'paid', totalCents: null, customer: { id: 5 }, lines: [] };
    expect(verify(orderContract(), body)).toEqual([
      '$.id: "x" does not match /^ord_[0-9]+$/',
      '$.totalCents: expected number, got null',
      '$.customer.id: expected string, got number',
      '$.customer.email: missing',
      '$.lines: expected at least 1 item(s), got 0',
    ]);
  });
});
