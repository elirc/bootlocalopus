const line = (unitCents, qty = 1, sku = 'SKU') => ({ sku, unitCents, qty });
const percent = (value, extra = {}) => ({ type: 'percent', value, ...extra });
const fixed = (value, extra = {}) => ({ type: 'fixed', value, ...extra });

/** The class callers catch, and the code they branch on. */
function expectOrderError(fn, code) {
  expect(fn).toThrow(solution.OrderError);
  expect(fn).toThrow({ code });
}

describe('priceOrder: subtotal and shipping', () => {
  it('multiplies unit price by quantity and adds shipping under the threshold', () => {
    expect(solution.priceOrder([line(1000, 2), line(250, 3)]))
      .toEqual({ subtotal: 2750, discount: 0, shipping: 495, total: 3245 });
  });

  const shippingCases = [
    // [subtotal, shipping]
    [4999, 495],
    [5000, 0],   // "at least": exactly on the threshold is free
    [5001, 0],
  ];
  for (const [subtotal, shipping] of shippingCases) {
    it(`a ${subtotal} basket pays ${shipping} shipping`, () => {
      const result = solution.priceOrder([line(subtotal)]);
      expect(result.shipping).toBe(shipping);
      expect(result.total).toBe(subtotal + shipping);
    });
  }

  it('checks the free-shipping threshold after the discount', () => {
    // 5500 before the coupon, 4500 after: shipping is charged.
    const result = solution.priceOrder([line(5500)], { coupon: fixed(1000) });
    expect(result).toEqual({ subtotal: 5500, discount: 1000, shipping: 495, total: 4995 });
  });
});

describe('priceOrder: coupons', () => {
  it('rounds a percent discount to the nearest cent, halves up', () => {
    expect(solution.priceOrder([line(1995)], { coupon: percent(10) }).discount).toBe(200);
    expect(solution.priceOrder([line(1994)], { coupon: percent(10) }).discount).toBe(199);
  });

  it('caps a fixed coupon at the subtotal', () => {
    expect(solution.priceOrder([line(1500)], { coupon: fixed(2000) }))
      .toEqual({ subtotal: 1500, discount: 1500, shipping: 495, total: 495 });
  });

  it('applies a coupon whose minSpend is met exactly', () => {
    expect(solution.priceOrder([line(3000)], { coupon: fixed(500, { minSpend: 3000 }) }).discount).toBe(500);
  });

  it('rejects a coupon one cent under its minSpend', () => {
    expectOrderError(() => solution.priceOrder([line(2999)], { coupon: fixed(500, { minSpend: 3000 }) }), 'MIN_SPEND');
  });

  it('rejects an unknown coupon type', () => {
    expectOrderError(() => solution.priceOrder([line(1000)], { coupon: { type: 'bogof', value: 1 } }), 'BAD_COUPON');
  });
});

describe('priceOrder: bad lines', () => {
  it('rejects an empty cart with EMPTY', () => {
    expectOrderError(() => solution.priceOrder([]), 'EMPTY');
  });

  const badLines = [
    ['qty 0', line(100, 0)],
    ['a negative qty', line(100, -1)],
    ['a fractional qty', line(100, 1.5)],
    ['a negative price', line(-100, 1)],
    ['a fractional price', line(99.5, 1)],
  ];
  for (const [label, bad] of badLines) {
    it(`rejects ${label} with BAD_LINE`, () => {
      expectOrderError(() => solution.priceOrder([line(100), bad]), 'BAD_LINE');
    });
  }

  it('accepts a free item (unitCents 0)', () => {
    expect(solution.priceOrder([line(0), line(100)]).subtotal).toBe(100);
  });
});

describe('priceOrder: no side effects', () => {
  it('leaves the lines exactly as they were', () => {
    const lines = [line(1000, 2, 'A'), line(250, 3, 'B')];
    const before = structuredClone(lines);
    solution.priceOrder(lines, { coupon: percent(10) });
    expect(lines).toEqual(before);
  });

  it('works on a deep-frozen cart', () => {
    const lines = Object.freeze([Object.freeze(line(6000))]);
    expect(solution.priceOrder(lines).total).toBe(6000);
  });
});
