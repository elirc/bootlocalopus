const config = {
  discountPercent: 10,
  maxDiscountCents: 2000,
  shippingCents: 499,
  taxPercent: 20,
  freeShippingThresholdCents: 5000,
};

const order = (items) => ({ items });
const item = (over = {}) => ({ sku: 'SKU-1', quantity: 1, unitCents: 1000, ...over });

describe('behaviour is unchanged (these passed before your refactor too)', () => {
  it('computes a simple order', () => {
    const out = solution.processOrder(order([item({ quantity: 2, unitCents: 1000 })]), config);
    // subtotal 2000, discount 200, shipping 499 (under threshold), tax 20% of 2299
    expect(out.ok).toBe(true);
    expect(out.subtotalCents).toBe(2000);
    expect(out.discountCents).toBe(200);
    expect(out.shippingCents).toBe(499);
    expect(out.taxCents).toBe(460);
    expect(out.totalCents).toBe(2000 - 200 + 499 + 460);
  });

  it('gives free shipping once the post-discount subtotal reaches the threshold', () => {
    // subtotal 4000, discount 10% = 400, so 3600 -- under 5000, shipping applies
    const under = solution.processOrder(order([item({ quantity: 4, unitCents: 1000 })]), config);
    expect(under.subtotalCents).toBe(4000);
    expect(under.discountCents).toBe(400);
    expect(under.shippingCents).toBe(499);

    // subtotal 6000, discount 600, so 5400 -- at or over 5000, shipping is free
    const over = solution.processOrder(order([item({ quantity: 6, unitCents: 1000 })]), config);
    expect(over.discountCents).toBe(600);
    expect(over.shippingCents).toBe(0);
  });

  it('decides free shipping on the post-discount amount, not the raw subtotal', () => {
    // subtotal 5200, discount 520 -> 4680, which is below the threshold even
    // though the subtotal is above it.
    const out = solution.processOrder(order([item({ quantity: 52, unitCents: 100 })]), config);
    expect(out.subtotalCents).toBe(5200);
    expect(out.shippingCents).toBe(499);
  });

  it('caps the discount', () => {
    const out = solution.processOrder(order([item({ quantity: 100, unitCents: 1000 })]), config);
    expect(out.discountCents).toBe(2000);
  });

  it('handles no discount configured', () => {
    const out = solution.processOrder(order([item()]), { shippingCents: 500, taxPercent: 10 });
    expect(out.discountCents).toBe(0);
    expect(out.subtotalCents).toBe(1000);
    expect(out.shippingCents).toBe(500);
    expect(out.taxCents).toBe(150);
  });

  it('sums several items', () => {
    const out = solution.processOrder(order([
      item({ quantity: 2, unitCents: 999 }),
      item({ sku: 'SKU-2', quantity: 3, unitCents: 250 }),
    ]), config);
    expect(out.subtotalCents).toBe(2 * 999 + 3 * 250);
  });

  it('rejects an empty order', () => {
    const out = solution.processOrder(order([]), config);
    expect(out.ok).toBe(false);
    expect(out.problems).toEqual(['order must have at least one item']);
  });

  it('rejects a missing order', () => {
    expect(solution.processOrder(null, config).ok).toBe(false);
    expect(solution.processOrder({}, config).ok).toBe(false);
  });

  it('collects every item problem, in order', () => {
    const out = solution.processOrder(order([
      { quantity: 0, unitCents: 0 },
    ]), config);
    expect(out.ok).toBe(false);
    expect(out.problems).toEqual([
      'item missing sku', 'quantity must be positive', 'unitCents must be positive',
    ]);
  });

  it('returns no totals when invalid', () => {
    const out = solution.processOrder(order([{ sku: 'x', quantity: -1, unitCents: 5 }]), config);
    expect(out.ok).toBe(false);
    expect(out.totalCents).toBeUndefined();
  });
});

describe('the extracted pieces exist and are pure', () => {
  it('subtotalCents sums quantity * unitCents', () => {
    expect(solution.subtotalCents([])).toBe(0);
    expect(solution.subtotalCents([{ quantity: 2, unitCents: 300 }])).toBe(600);
    expect(solution.subtotalCents([
      { quantity: 2, unitCents: 300 },
      { quantity: 1, unitCents: 99 },
    ])).toBe(699);
  });

  it('subtotalCents does not mutate its input', () => {
    const items = [{ quantity: 2, unitCents: 300 }];
    const before = JSON.stringify(items);
    solution.subtotalCents(items);
    expect(JSON.stringify(items)).toBe(before);
  });

  it('discountCents applies the percentage and the cap', () => {
    expect(solution.discountCents(1000, { discountPercent: 10 })).toBe(100);
    expect(solution.discountCents(1000, {})).toBe(0);
    expect(solution.discountCents(100000, { discountPercent: 10, maxDiscountCents: 2000 })).toBe(2000);
    expect(solution.discountCents(1000, { discountPercent: 10, maxDiscountCents: 2000 })).toBe(100);
  });

  it('discountCents rounds the way the original did', () => {
    // 333 * 10% = 33.3 -> 33
    expect(solution.discountCents(333, { discountPercent: 10 })).toBe(33);
    // 335 * 10% = 33.5 -> 34
    expect(solution.discountCents(335, { discountPercent: 10 })).toBe(34);
  });

  it('shippingCents honours the threshold and the default', () => {
    expect(solution.shippingCents(4999, { shippingCents: 499, freeShippingThresholdCents: 5000 })).toBe(499);
    expect(solution.shippingCents(5000, { shippingCents: 499, freeShippingThresholdCents: 5000 })).toBe(0);
    expect(solution.shippingCents(9999, { shippingCents: 499, freeShippingThresholdCents: 10000 })).toBe(499);
    // The original hardcoded 5000, so that must remain the default.
    expect(solution.shippingCents(5000, { shippingCents: 499 })).toBe(0);
    expect(solution.shippingCents(4999, { shippingCents: 499 })).toBe(499);
  });

  it('shippingCents is 0 when none is configured', () => {
    expect(solution.shippingCents(100, {})).toBe(0);
  });

  it('taxCents applies the percentage to what it is given', () => {
    expect(solution.taxCents(1000, { taxPercent: 20 })).toBe(200);
    expect(solution.taxCents(999, { taxPercent: 20 })).toBe(200);
    expect(solution.taxCents(0, { taxPercent: 20 })).toBe(0);
  });

  it('validateOrder returns an empty array for a valid order', () => {
    expect(solution.validateOrder(order([item()]))).toEqual([]);
  });

  it('validateOrder reports problems without throwing', () => {
    expect(solution.validateOrder(null)).toEqual(['order must have at least one item']);
    expect(solution.validateOrder(order([]))).toEqual(['order must have at least one item']);
    expect(solution.validateOrder(order([{ sku: 'a', quantity: 1, unitCents: -5 }])))
      .toEqual(['unitCents must be positive']);
  });
});

describe('processOrder is now a composition, not a monolith', () => {
  it('delegates to the extracted functions', () => {
    // Every piece is reachable from the module, and processOrder is short.
    const source = solution.processOrder.toString();
    expect(source).toContain('validateOrder');
    expect(source).toContain('subtotalCents');
    expect(source).toContain('discountCents');
    expect(source).toContain('shippingCents');
    expect(source).toContain('taxCents');
  });

  it('no longer contains the duplicated loops or the magic number', () => {
    // Comments are stripped first: "// the default threshold was 5000" is fine.
    const source = solution.processOrder.toString()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(source).not.toMatch(/\b5000\b/);
    expect(source).not.toContain('for (const item of order.items)');
  });

  it('is short enough to read at a glance', () => {
    const lines = solution.processOrder.toString().split('\n').filter((l) => l.trim());
    expect(lines.length).toBeLessThan(22);
  });
});