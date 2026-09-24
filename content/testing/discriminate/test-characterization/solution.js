const item = (sku, quantity, unitCents) => ({ sku, quantity, unitCents });
const run = (items, config) => solution.processOrder({ items }, config);

describe('processOrder: validation', () => {
  it('rejects an order with no items', () => {
    expect(run([], { taxPercent: 20 })).toEqual({ ok: false, problems: ['order must have at least one item'] });
  });

  it('reports every problem on an item, in field order', () => {
    expect(run([item('', 0, -5)], { taxPercent: 20 })).toEqual({
      ok: false,
      problems: ['item missing sku', 'quantity must be positive', 'unitCents must be positive'],
    });
  });

  it('reports problems item by item across the whole order', () => {
    expect(run([item('A', 0, 100), item('', 1, 100), item('C', 1, 100)], { taxPercent: 20 })).toEqual({
      ok: false,
      problems: ['quantity must be positive', 'item missing sku'],
    });
  });
});

describe('processOrder: totals', () => {
  it('totals a plain order with shipping and tax', () => {
    expect(run([item('A', 2, 1000)], { taxPercent: 10, shippingCents: 500 })).toEqual({
      ok: true,
      problems: [],
      subtotalCents: 2000,
      discountCents: 0,
      shippingCents: 500,
      taxCents: 250,
      totalCents: 2750,
    });
  });

  it('rounds the discount to whole cents before anything uses it', () => {
    // 999 * 10% = 99.9 -> 100
    expect(run([item('A', 1, 999)], { discountPercent: 10, taxPercent: 0 })).toMatchObject({
      subtotalCents: 999,
      discountCents: 100,
      totalCents: 899,
    });
  });

  it('decides free shipping on the amount after the discount', () => {
    // 5200 before the discount, 4680 after: shipping is charged.
    expect(run([item('A', 1, 5200)], { discountPercent: 10, shippingCents: 499, taxPercent: 0 })).toMatchObject({
      discountCents: 520,
      shippingCents: 499,
      totalCents: 5179,
    });
  });

  it('ships free from exactly 5000 after the discount', () => {
    expect(run([item('A', 1, 5000)], { shippingCents: 499, taxPercent: 0 })).toMatchObject({ shippingCents: 0, totalCents: 5000 });
  });

  it('caps the discount at maxDiscountCents', () => {
    expect(run([item('A', 1, 10000)], { discountPercent: 50, maxDiscountCents: 1000, taxPercent: 0 })).toMatchObject({
      discountCents: 1000,
      totalCents: 9000,
    });
  });

  it('leaves a discount under the cap alone', () => {
    expect(run([item('A', 1, 10000)], { discountPercent: 5, maxDiscountCents: 1000, taxPercent: 0 })).toMatchObject({
      discountCents: 500,
      totalCents: 9500,
    });
  });
});
