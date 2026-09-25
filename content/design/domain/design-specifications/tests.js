const { spec, all, any, isMember, hasOrderedAtLeast, livesIn, isFlagged, freeDelivery } = solution;

const customer = (o = {}) => ({ id: 'c1', country: 'GB', membership: 'none', orderCount: 0, fraudFlags: [], ...o });
let even, positive, small;
const init = () => {
  even = spec('even', (n) => n % 2 === 0);
  positive = spec('positive', (n) => n > 0);
  small = spec('small', (n) => Math.abs(n) < 100);
};

describe('leaf specifications', () => {
  beforeEach(init);
  it('evaluate a named predicate and explain a failure by name', () => {
    expect(even.name).toBe('even');
    expect(even.isSatisfiedBy(4)).toBe(true);
    expect(even.isSatisfiedBy(3)).toBe(false);
    expect(even.explain(4)).toEqual({ satisfied: true, failed: [] });
    expect(even.explain(3)).toEqual({ satisfied: false, failed: ['even'] });
  });

  it('coerce truthy and falsy predicate results to booleans', () => {
    const hasTags = spec('has-tags', (x) => x.tags.length);
    expect(hasTags.isSatisfiedBy({ tags: [1, 2] })).toBe(true);
    expect(hasTags.isSatisfiedBy({ tags: [] })).toBe(false);
  });

  it('require a name and a predicate', () => {
    expect(() => spec('', () => true)).toThrow(TypeError);
    expect(() => spec('x')).toThrow(TypeError);
  });
});

describe('combinators', () => {
  beforeEach(init);
  it('and: satisfied only if both are, and lists every failing rule', () => {
    const s = even.and(positive);
    expect(s.isSatisfiedBy(4)).toBe(true);
    expect(s.explain(3)).toEqual({ satisfied: false, failed: ['even'] });
    expect(s.explain(-3)).toEqual({ satisfied: false, failed: ['even', 'positive'] });
  });

  it('or: satisfied if either is; when neither, lists both', () => {
    const s = even.or(positive);
    expect(s.explain(3)).toEqual({ satisfied: true, failed: [] });
    expect(s.explain(-2)).toEqual({ satisfied: true, failed: [] });
    expect(s.explain(-3)).toEqual({ satisfied: false, failed: ['even', 'positive'] });
  });

  it('not: inverts, and names the negation when it fails', () => {
    const odd = even.not();
    expect(odd.name).toBe('not even');
    expect(odd.explain(3)).toEqual({ satisfied: true, failed: [] });
    expect(odd.explain(4)).toEqual({ satisfied: false, failed: ['not even'] });
  });

  it('composite names describe the rule', () => {
    expect(even.and(positive).name).toBe('(even and positive)');
    expect(even.or(positive).name).toBe('(even or positive)');
    expect(even.and(positive).not().name).toBe('not (even and positive)');
    expect(all(even, positive, small).name).toBe('(even and positive and small)');
    expect(any(even, positive).name).toBe('(even or positive)');
  });

  it('not over a composite reports the composite', () => {
    const notBoth = even.and(positive).not();
    expect(notBoth.explain(4)).toEqual({ satisfied: false, failed: ['not (even and positive)'] });
    expect(notBoth.explain(3).satisfied).toBe(true);
  });

  it('all() and any() take any number of specifications', () => {
    expect(all(even, positive, small).explain(-300)).toEqual({ satisfied: false, failed: ['positive', 'small'] });
    expect(all(even, positive, small).isSatisfiedBy(42)).toBe(true);
    expect(any(even, positive, small).isSatisfiedBy(-301)).toBe(false);
    expect(any(even, positive, small).explain(-301).failed).toEqual(['even', 'positive', 'small']);
    expect(() => all()).toThrow(TypeError);
    expect(() => any()).toThrow(TypeError);
  });

  it('combining never changes the specifications combined', () => {
    const both = even.and(positive);
    const either = even.or(small);
    expect(even.explain(3)).toEqual({ satisfied: false, failed: ['even'] });
    expect(both.name).toBe('(even and positive)');
    expect(either.name).toBe('(even or small)');
    expect(both.isSatisfiedBy(-2)).toBe(false);
    expect(either.isSatisfiedBy(-2)).toBe(true);
  });

  it('select() filters a collection', () => {
    expect(even.and(positive).select([-4, -3, 0, 1, 2, 6, 7])).toEqual([2, 6]);
  });
});

describe('the business rule: free delivery', () => {
  it('builds the rule from named parts', () => {
    expect(isMember.name).toBe('member');
    expect(hasOrderedAtLeast(3).name).toBe('ordered-at-least-3');
    expect(livesIn('GB').name).toBe('lives-in-GB');
    expect(isFlagged.name).toBe('flagged');
  });

  it('members and regulars in GB qualify; fraud flags disqualify', () => {
    expect(freeDelivery.isSatisfiedBy(customer({ membership: 'active' }))).toBe(true);
    expect(freeDelivery.isSatisfiedBy(customer({ orderCount: 3 }))).toBe(true);
    expect(freeDelivery.isSatisfiedBy(customer({ orderCount: 2 }))).toBe(false);
    expect(freeDelivery.isSatisfiedBy(customer({ membership: 'lapsed', orderCount: 1 }))).toBe(false);
    expect(freeDelivery.isSatisfiedBy(customer({ membership: 'active', country: 'IE' }))).toBe(false);
    expect(freeDelivery.isSatisfiedBy(customer({ membership: 'active', fraudFlags: ['chargeback'] }))).toBe(false);
  });

  it('tells support exactly why a customer did not qualify', () => {
    expect(freeDelivery.explain(customer({ country: 'FR', orderCount: 1, fraudFlags: ['velocity'] }))).toEqual({
      satisfied: false,
      failed: ['lives-in-GB', 'member', 'ordered-at-least-3', 'not flagged'],
    });
    expect(freeDelivery.explain(customer({ membership: 'active', fraudFlags: ['x'] }))).toEqual({
      satisfied: false,
      failed: ['not flagged'],
    });
  });
});
