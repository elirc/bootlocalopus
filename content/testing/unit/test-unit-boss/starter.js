// Forty tests like these passed while checkout gave away free shipping and negative totals.
const line = (unitCents, qty = 1, sku = 'SKU') => ({ sku, unitCents, qty });

describe('priceOrder', () => {
  it('prices a small basket with shipping', () => {
    expect(solution.priceOrder([line(1000)])).toEqual({ subtotal: 1000, discount: 0, shipping: 495, total: 1495 });
  });

  it('applies a percent coupon', () => {
    const result = solution.priceOrder([line(2000)], { coupon: { type: 'percent', value: 10 } });
    expect(result.discount).toBe(200);
  });

  it('rejects an empty cart', () => {
    expect(() => solution.priceOrder([])).toThrow();
  });

  // TODO: thresholds (on and just past), discount-then-shipping, the fixed-coupon cap,
  // rounding, every error code, and what the call did to `lines`.
});
