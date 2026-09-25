const { Order, DomainError, MAX_QUANTITY, MAX_LINES } = solution;
const codeOf = (fn) => {
  try { fn(); } catch (e) {
    if (!(e instanceof DomainError)) throw new Error(`expected a DomainError, got ${e && e.name}: ${e && e.message}`);
    expect(e.name).toBe('DomainError');
    return e.code;
  }
  return null;
};
const draft = () => {
  const o = new Order('o-1');
  o.addItem('coat', 5000, 1);
  o.addItem('socks', 500, 2);
  return o;
};

describe('lines', () => {
  it('adds items and computes totals', () => {
    const o = draft();
    expect(o.snapshot()).toEqual({
      id: 'o-1', status: 'draft', placedAt: null, coupon: null,
      lines: [
        { sku: 'coat', unitPriceMinor: 5000, quantity: 1 },
        { sku: 'socks', unitPriceMinor: 500, quantity: 2 },
      ],
      subtotalMinor: 6000, discountMinor: 0, totalMinor: 6000,
    });
  });

  it('merges a repeated SKU into one line', () => {
    const o = draft();
    o.addItem('socks', 500, 3);
    expect(o.snapshot().lines).toEqual([
      { sku: 'coat', unitPriceMinor: 5000, quantity: 1 },
      { sku: 'socks', unitPriceMinor: 500, quantity: 5 },
    ]);
  });

  it('refuses a repeated SKU at a different price', () => {
    const o = draft();
    expect(codeOf(() => o.addItem('socks', 450, 1))).toBe('PRICE_MISMATCH');
    expect(o.snapshot().lines[1]).toEqual({ sku: 'socks', unitPriceMinor: 500, quantity: 2 });
  });

  it('caps each line at MAX_QUANTITY, including when merging, and changes nothing on failure', () => {
    expect(MAX_QUANTITY).toBe(10);
    const o = draft();
    expect(codeOf(() => o.addItem('hat', 1000, 11))).toBe('QUANTITY_LIMIT');
    expect(codeOf(() => o.addItem('socks', 500, 9))).toBe('QUANTITY_LIMIT');
    expect(o.snapshot().lines.map((l) => l.quantity)).toEqual([1, 2]);
    o.addItem('socks', 500, 8);
    expect(o.snapshot().lines[1].quantity).toBe(10);
    expect(codeOf(() => o.changeQuantity('coat', 11))).toBe('QUANTITY_LIMIT');
    expect(o.snapshot().lines[0].quantity).toBe(1);
  });

  it('caps the number of distinct lines at MAX_LINES', () => {
    expect(MAX_LINES).toBe(20);
    const o = new Order('big');
    for (let i = 0; i < 20; i++) o.addItem('sku-' + i, 100, 1);
    expect(codeOf(() => o.addItem('one-too-many', 100, 1))).toBe('TOO_MANY_LINES');
    o.addItem('sku-3', 100, 1); // merging is not a new line
    expect(o.snapshot().lines).toHaveLength(20);
  });

  it('rejects nonsense quantities and prices', () => {
    const o = draft();
    for (const q of [0, -1, 1.5, '2', NaN]) expect(codeOf(() => o.addItem('hat', 1000, q))).toBe('INVALID_QUANTITY');
    for (const p of [-1, 9.99, '1000']) expect(codeOf(() => o.addItem('hat', p, 1))).toBe('INVALID_PRICE');
    for (const q of [-1, 2.5]) expect(codeOf(() => o.changeQuantity('coat', q))).toBe('INVALID_QUANTITY');
    expect(o.snapshot().lines).toHaveLength(2);
  });

  it('changeQuantity(sku, 0) removes the line; an unknown SKU is an error', () => {
    const o = draft();
    o.changeQuantity('coat', 0);
    expect(o.snapshot().lines.map((l) => l.sku)).toEqual(['socks']);
    expect(codeOf(() => o.changeQuantity('coat', 1))).toBe('UNKNOWN_LINE');
  });
});

describe('coupons', () => {
  it('applies a percentage or a fixed amount, one coupon at a time', () => {
    const o = draft();
    o.applyCoupon({ code: 'TEN', percentOff: 10 });
    expect(o.totals()).toEqual({ subtotalMinor: 6000, discountMinor: 600, totalMinor: 5400 });
    o.applyCoupon({ code: 'FIVER', amountOffMinor: 500 });
    expect(o.totals()).toEqual({ subtotalMinor: 6000, discountMinor: 500, totalMinor: 5500 });
    expect(o.snapshot().coupon.code).toBe('FIVER');
    o.removeCoupon();
    expect(o.totals().discountMinor).toBe(0);
  });

  it('never discounts below zero, however lines change later', () => {
    const o = draft();
    o.applyCoupon({ code: 'BIG', amountOffMinor: 5500 });
    expect(o.totals().totalMinor).toBe(500);
    o.changeQuantity('coat', 0);
    expect(o.totals()).toEqual({ subtotalMinor: 1000, discountMinor: 1000, totalMinor: 0 });
  });

  it('refuses a coupon whose minimum spend is not met', () => {
    const o = draft();
    expect(codeOf(() => o.applyCoupon({ code: 'SPEND100', amountOffMinor: 1000, minSubtotalMinor: 10000 }))).toBe('COUPON_MINIMUM');
    expect(o.snapshot().coupon).toBeNull();
  });

  it('drops the coupon when a change takes the order below its minimum', () => {
    const o = draft();
    o.applyCoupon({ code: 'SPEND50', amountOffMinor: 1000, minSubtotalMinor: 5000 });
    o.changeQuantity('socks', 1);
    expect(o.snapshot().coupon.code).toBe('SPEND50');
    o.changeQuantity('coat', 0);
    expect(o.snapshot().coupon).toBeNull();
    expect(o.totals().discountMinor).toBe(0);
  });

  it('rejects malformed coupons', () => {
    const o = draft();
    expect(codeOf(() => o.applyCoupon({ code: 'X' }))).toBe('INVALID_COUPON');
    expect(codeOf(() => o.applyCoupon({ code: 'X', percentOff: 10, amountOffMinor: 100 }))).toBe('INVALID_COUPON');
    expect(codeOf(() => o.applyCoupon({ code: 'X', percentOff: 150 }))).toBe('INVALID_COUPON');
    expect(codeOf(() => o.applyCoupon({ code: 'X', amountOffMinor: -100 }))).toBe('INVALID_COUPON');
  });
});

describe('lifecycle', () => {
  it('places a non-empty draft, after which lines and coupons are frozen', () => {
    const o = draft();
    o.place('2024-06-01T10:00:00Z');
    expect(o.snapshot().status).toBe('placed');
    expect(o.snapshot().placedAt).toBe('2024-06-01T10:00:00Z');
    expect(codeOf(() => o.addItem('hat', 1000, 1))).toBe('INVALID_STATUS');
    expect(codeOf(() => o.changeQuantity('coat', 2))).toBe('INVALID_STATUS');
    expect(codeOf(() => o.applyCoupon({ code: 'LATE', percentOff: 50 }))).toBe('INVALID_STATUS');
    expect(codeOf(() => o.removeCoupon())).toBe('INVALID_STATUS');
    expect(codeOf(() => o.place('again'))).toBe('INVALID_STATUS');
    expect(o.totals().totalMinor).toBe(6000);
  });

  it('refuses to place an empty order', () => {
    const o = new Order('empty');
    expect(codeOf(() => o.place('now'))).toBe('EMPTY_ORDER');
    o.addItem('x', 100, 1);
    o.changeQuantity('x', 0);
    expect(codeOf(() => o.place('now'))).toBe('EMPTY_ORDER');
    expect(o.snapshot().status).toBe('draft');
  });

  it('cancels a draft or a placed order, once', () => {
    const a = draft();
    a.cancel();
    expect(a.snapshot().status).toBe('cancelled');
    expect(codeOf(() => a.cancel())).toBe('INVALID_STATUS');
    expect(codeOf(() => a.place('now'))).toBe('INVALID_STATUS');
    const b = draft();
    b.place('now');
    b.cancel();
    expect(b.snapshot().status).toBe('cancelled');
  });
});

describe('the aggregate guards its own state', () => {
  it('snapshots are copies: changing one changes nothing', () => {
    const o = draft();
    o.applyCoupon({ code: 'TEN', percentOff: 10 });
    const snap = o.snapshot();
    snap.lines[0].quantity = 99;
    snap.lines.push({ sku: 'free-tv', unitPriceMinor: 0, quantity: 1 });
    snap.coupon.percentOff = 100;
    snap.status = 'placed';
    expect(o.snapshot().lines).toEqual([
      { sku: 'coat', unitPriceMinor: 5000, quantity: 1 },
      { sku: 'socks', unitPriceMinor: 500, quantity: 2 },
    ]);
    expect(o.totals().discountMinor).toBe(600);
    expect(o.snapshot().status).toBe('draft');
  });

  it('keeps every invariant through a long sequence of valid and invalid commands', () => {
    let seed = 42;
    const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const skus = ['a', 'b', 'c', 'd'];
    const prices = { a: 999, b: 250, c: 4000, d: 1 };
    const o = new Order('fuzz');
    for (let i = 0; i < 400; i++) {
      const sku = skus[rand(4)];
      const op = rand(6);
      try {
        if (op === 0) o.addItem(sku, prices[sku], rand(6) + 1);
        if (op === 1) o.addItem(sku, prices[sku] + rand(2), 1);
        if (op === 2) o.changeQuantity(sku, rand(13) - 1);
        if (op === 3) o.applyCoupon({ code: 'P', percentOff: rand(100) + 1, minSubtotalMinor: rand(8000) });
        if (op === 4) o.applyCoupon({ code: 'A', amountOffMinor: rand(20000) + 1, minSubtotalMinor: rand(8000) });
        if (op === 5) o.removeCoupon();
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
      }
      const s = o.snapshot();
      for (const line of s.lines) {
        expect(Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 10).toBe(true);
        expect([prices[line.sku], prices[line.sku] + 1]).toContain(line.unitPriceMinor);
      }
      expect(new Set(s.lines.map((l) => l.sku)).size).toBe(s.lines.length);
      const subtotal = s.lines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
      expect(s.subtotalMinor).toBe(subtotal);
      expect(s.discountMinor).toBeGreaterThanOrEqual(0);
      expect(s.discountMinor).toBeLessThanOrEqual(subtotal);
      expect(s.totalMinor).toBe(subtotal - s.discountMinor);
      if (s.coupon) expect(subtotal).toBeGreaterThanOrEqual(s.coupon.minSubtotalMinor);
    }
  });
});
