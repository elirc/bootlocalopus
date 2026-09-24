// Characterise processOrder as it is today. Your tests run against the original,
// a refactored version that must behave identically, and five refactoring slips.

const item = (sku, quantity, unitCents) => ({ sku, quantity, unitCents });

describe('processOrder (characterisation)', () => {
  it('rejects an order with no items', () => {
    expect(solution.processOrder({ items: [] }, { taxPercent: 20 })).toEqual({
      ok: false,
      problems: ['order must have at least one item'],
    });
  });

  it('totals a simple order', () => {
    const result = solution.processOrder({ items: [item('A', 2, 1000)] }, { taxPercent: 10, shippingCents: 500 });
    // console.log(result);  // see what it really does, then pin it
    expect(result.ok).toBe(true);
  });

  // TODO: pin the edges. Where does rounding happen? Which amount decides free shipping?
  // What does the discount cap do? What exactly comes back for several problems?
});
