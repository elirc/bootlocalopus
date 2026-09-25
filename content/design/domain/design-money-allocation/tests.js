const { allocate, splitEvenly, distributeDiscount } = solution;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const errorOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('allocate', () => {
  it('splits exactly, never losing or inventing a penny', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(100, [1, 2, 3])).toEqual([17, 33, 50]);
    expect(allocate(5, [1, 1])).toEqual([3, 2]);
  });

  it('gives leftover pennies to the largest fractional shares, not simply the first or last', () => {
    // exact shares 4.29, 1.43, 4.29: the middle part has the largest remainder
    expect(allocate(10, [3, 1, 3])).toEqual([4, 2, 4]);
    // exact shares 16.67, 33.33, 50: the first part has it
    expect(allocate(100, [1, 2, 3])).toEqual([17, 33, 50]);
    // exact shares 33.33, 33.33, 34.34: the last part has the largest remainder
    expect(allocate(101, [33, 33, 34])).toEqual([33, 33, 35]);
  });

  it('breaks ties towards earlier parts', () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocate(7, [1, 1, 1, 1])).toEqual([2, 2, 2, 1]);
  });

  it('gives nothing to a zero ratio', () => {
    expect(allocate(1000, [0, 1, 0, 1])).toEqual([0, 500, 0, 500]);
    expect(allocate(3, [0, 1, 1])).toEqual([0, 2, 1]);
  });

  it('allocates a negative total (a refund) as the mirror image', () => {
    expect(allocate(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
    expect(allocate(-10, [3, 1, 3])).toEqual([-4, -2, -4]);
    expect(allocate(-1, [1, 1]).map((x) => Object.is(x, -0))).toEqual([false, false]);
    expect(allocate(-1, [1, 1])).toEqual([-1, 0]);
  });

  it('handles a zero total', () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(0, [1, 2]).every((x) => Object.is(x, 0))).toBe(true);
  });

  it('always sums to the total and stays within one unit of the exact share', () => {
    const cases = [[99999, [7, 13, 29, 51]], [1, [1, 1, 1, 1, 1]], [123456, [3, 3, 3]], [-777, [5, 2, 9, 1]], [1000000, [1, 999999]]];
    for (const [total, ratios] of cases) {
      const parts = allocate(total, ratios);
      expect(sum(parts)).toBe(total);
      const ratioSum = sum(ratios);
      parts.forEach((p, i) => expect(Math.abs(p - (total * ratios[i]) / ratioSum)).toBeLessThan(1));
    }
  });

  it('rejects inputs that have no sensible answer', () => {
    for (const [total, ratios] of [[10.5, [1, 1]], [10, []], [10, [0, 0]], [10, [1, -1]], [10, [0.5, 0.5]], [10, 'abc']]) {
      expect(errorOf(() => allocate(total, ratios))).toBeInstanceOf(RangeError);
    }
  });

  it('does not modify the ratios array', () => {
    const ratios = [3, 1, 3];
    allocate(10, ratios);
    expect(ratios).toEqual([3, 1, 3]);
  });
});

describe('splitEvenly', () => {
  it('splits a bill between n people', () => {
    expect(splitEvenly(2000, 3)).toEqual([667, 667, 666]);
    expect(splitEvenly(10, 4)).toEqual([3, 3, 2, 2]);
    expect(splitEvenly(10, 1)).toEqual([10]);
  });

  it('rejects a non-positive or fractional number of people', () => {
    expect(errorOf(() => splitEvenly(100, 0))).toBeInstanceOf(RangeError);
    expect(errorOf(() => splitEvenly(100, 2.5))).toBeInstanceOf(RangeError);
  });
});

describe('distributeDiscount', () => {
  const lines = () => [
    { sku: 'coat', amountMinor: 1000 },
    { sku: 'scarf', amountMinor: 500 },
    { sku: 'socks', amountMinor: 250 },
  ];

  it('spreads the discount in proportion to line amounts, summing exactly', () => {
    const out = distributeDiscount(lines(), 100);
    expect(out).toEqual([
      { sku: 'coat', amountMinor: 1000, discountMinor: 57, netMinor: 943 },
      { sku: 'scarf', amountMinor: 500, discountMinor: 29, netMinor: 471 },
      { sku: 'socks', amountMinor: 250, discountMinor: 14, netMinor: 236 },
    ]);
    expect(sum(out.map((l) => l.discountMinor))).toBe(100);
  });

  it('can discount the whole order, and never below zero on a line', () => {
    const out = distributeDiscount(lines(), 1750);
    expect(out.map((l) => l.netMinor)).toEqual([0, 0, 0]);
  });

  it('gives free lines no discount', () => {
    const out = distributeDiscount([{ sku: 'gift', amountMinor: 0 }, { sku: 'mug', amountMinor: 900 }], 90);
    expect(out.map((l) => l.discountMinor)).toEqual([0, 90]);
  });

  it('handles a zero discount, even on an all-free order', () => {
    expect(distributeDiscount(lines(), 0).map((l) => l.discountMinor)).toEqual([0, 0, 0]);
    expect(distributeDiscount([{ sku: 'gift', amountMinor: 0 }], 0)).toEqual([{ sku: 'gift', amountMinor: 0, discountMinor: 0, netMinor: 0 }]);
  });

  it('rejects a discount larger than the order, or a negative one', () => {
    expect(errorOf(() => distributeDiscount(lines(), 1751))).toBeInstanceOf(RangeError);
    expect(errorOf(() => distributeDiscount(lines(), -1))).toBeInstanceOf(RangeError);
  });

  it('does not mutate the lines it is given', () => {
    const input = lines();
    distributeDiscount(input, 100);
    expect(input).toEqual(lines());
  });
});
