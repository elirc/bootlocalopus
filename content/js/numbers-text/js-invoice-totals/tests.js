const { computeInvoice, InvoiceError } = solution;

const gbp = (lines, extra = {}) => computeInvoice({ currency: 'GBP', locale: 'en-GB', lines, ...extra });
const line = (unitPrice, taxRateBps = 0, quantity = 1, sku = 'X') => ({ sku, quantity, unitPrice, taxRateBps });

function expectInvoiceError(fn, field, lineIndex) {
  let caught;
  try { fn(); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(InvoiceError);
  expect(caught).toBeInstanceOf(Error);
  expect(caught.name).toBe('InvoiceError');
  expect(caught.field).toBe(field);
  expect(caught.line).toBe(lineIndex);
}

describe('a simple invoice', () => {
  it('computes and formats one line with VAT', () => {
    expect(gbp([{ sku: 'MUG', quantity: 2, unitPrice: '19.99', taxRateBps: 2000 }])).toStrictEqual({
      currency: 'GBP',
      digits: 2,
      lines: [{ sku: 'MUG', quantity: 2, unitPrice: 1999, net: 3998, discount: 0, taxable: 3998, tax: 800, total: 4798 }],
      taxes: [{ rateBps: 2000, taxable: 3998, tax: 800 }],
      subtotal: 3998,
      discount: 0,
      tax: 800,
      total: 4798,
      formatted: { subtotal: '£39.98', discount: '£0.00', tax: '£8.00', total: '£47.98' },
    });
  });

  it('handles an empty invoice', () => {
    const inv = gbp([]);
    expect([inv.subtotal, inv.discount, inv.tax, inv.total]).toEqual([0, 0, 0, 0]);
    expect(inv.lines).toEqual([]);
    expect(inv.taxes).toEqual([]);
  });
});

describe('discounts', () => {
  it('spreads the discount over lines by net, largest remainder first', () => {
    const inv = gbp([line('10.00', 0, 1, 'BOOK'), line('10.00', 2000, 2, 'MUG')], { discount: '10.00' });
    expect(inv.lines.map((l) => [l.discount, l.taxable, l.tax, l.total])).toEqual([
      [333, 667, 0, 667],
      [667, 1333, 267, 1600],
    ]);
    expect(inv.taxes).toStrictEqual([
      { rateBps: 0, taxable: 667, tax: 0 },
      { rateBps: 2000, taxable: 1333, tax: 267 },
    ]);
    expect([inv.subtotal, inv.discount, inv.tax, inv.total]).toEqual([3000, 1000, 267, 2267]);
    expect(inv.formatted.discount).toBe('£10.00');
    expect(inv.formatted.total).toBe('£22.67');
  });

  it('gives leftover units by largest remainder, not to the last line', () => {
    const even = gbp([line('10.00', 0, 1, 'A'), line('10.00', 0, 1, 'B'), line('10.00', 0, 1, 'C')], { discount: '10.00' });
    expect(even.lines.map((l) => l.discount)).toEqual([334, 333, 333]);
    const uneven = gbp([line('10.00', 0, 1, 'A'), line('0.50', 0, 1, 'B'), line('9.50', 0, 1, 'C')], { discount: '0.07' });
    // exact shares 3.5, 0.175, 3.325 → 3, 0, 3 plus one unit to the largest remainder (A)
    expect(uneven.lines.map((l) => l.discount)).toEqual([4, 0, 3]);
  });

  it('allows a discount equal to the subtotal', () => {
    const inv = gbp([line('5.00', 2000), line('5.00', 500)], { discount: '10' });
    expect(inv.total).toBe(0);
    expect(inv.lines.map((l) => l.discount)).toEqual([500, 500]);
  });

  it('rejects a discount larger than the subtotal', () => {
    expectInvoiceError(() => gbp([line('5.00')], { discount: '5.01' }), 'discount', null);
  });

  it('rejects a malformed or negative discount', () => {
    expectInvoiceError(() => gbp([line('5.00')], { discount: 'ten' }), 'discount', null);
    expectInvoiceError(() => gbp([line('5.00')], { discount: '-1.00' }), 'discount', null);
    expectInvoiceError(() => gbp([line('5.00')], { discount: '1.001' }), 'discount', null);
  });
});

describe('tax rounding', () => {
  it('rounds each line half to even', () => {
    const inv = gbp([line('1.25', 1000), line('1.35', 1000)]);
    expect(inv.lines.map((l) => l.tax)).toEqual([12, 14]);
    expect(inv.tax).toBe(26);
  });

  it('rounds per line, not on the total', () => {
    const inv = gbp([line('1.24', 1000), line('1.24', 1000), line('1.24', 1000)]);
    expect(inv.tax).toBe(36);
    expect(inv.taxes).toStrictEqual([{ rateBps: 1000, taxable: 372, tax: 36 }]);
  });

  it('lists tax groups in ascending rate order and keeps every sum consistent', () => {
    const inv = gbp(
      [line('3.33', 2000, 3), line('0.99', 0, 7), line('12.50', 500, 1), line('7.77', 2000, 2), line('2.01', 500, 5)],
      { discount: '4.44' },
    );
    expect(inv.taxes.map((t) => t.rateBps)).toEqual([0, 500, 2000]);
    const sum = (xs) => xs.reduce((a, b) => a + b, 0);
    expect(sum(inv.lines.map((l) => l.net))).toBe(inv.subtotal);
    expect(sum(inv.lines.map((l) => l.discount))).toBe(inv.discount);
    expect(sum(inv.lines.map((l) => l.tax))).toBe(inv.tax);
    expect(sum(inv.lines.map((l) => l.total))).toBe(inv.total);
    expect(sum(inv.taxes.map((t) => t.tax))).toBe(inv.tax);
    expect(sum(inv.taxes.map((t) => t.taxable))).toBe(inv.subtotal - inv.discount);
    expect(inv.total).toBe(inv.subtotal - inv.discount + inv.tax);
  });
});

describe('currencies', () => {
  it('uses no minor unit for yen', () => {
    const inv = computeInvoice({ currency: 'JPY', locale: 'en-US', lines: [line('1,500', 1000, 3)] });
    expect(inv.digits).toBe(0);
    expect([inv.subtotal, inv.tax, inv.total]).toEqual([4500, 450, 4950]);
    expect(inv.formatted.total).toBe('¥4,950');
  });

  it('rejects a fraction on a yen price', () => {
    expectInvoiceError(
      () => computeInvoice({ currency: 'JPY', locale: 'en-US', lines: [line('100'), line('1500.5')] }),
      'unitPrice',
      1,
    );
  });

  it('uses three digits for Kuwaiti dinar', () => {
    const inv = computeInvoice({ currency: 'KWD', locale: 'en', lines: [line('1.005', 0, 2)] });
    expect(inv.digits).toBe(3);
    expect(inv.total).toBe(2010);
    expect(inv.formatted.total).toBe('KWD 2.010');
  });

  it('formats in the requested locale', () => {
    const inv = computeInvoice({ currency: 'EUR', locale: 'de-DE', lines: [line('1,234.56', 0)] });
    expect(inv.formatted.total).toBe('1.234,56 €');
  });
});

describe('exactness', () => {
  it('computes tax exactly when the product passes 2**53', () => {
    // net 7380638431926892 × 12.5% = 922579803990861.5 → half to even → …862
    const inv = gbp([line('18,451,596,079,817.23', 1250, 4)]);
    expect(inv.lines[0].net).toBe(7380638431926892);
    expect(inv.tax).toBe(922579803990862);
    expect(inv.total).toBe(8303218235917754);
  });

  it('formats the exact decimal, not a rounded float', () => {
    const inv = gbp([line('90,071,992,547,409.91')]);
    expect(inv.total).toBe(Number.MAX_SAFE_INTEGER);
    expect(inv.formatted.total).toBe('£90,071,992,547,409.91');
  });

  it('throws a RangeError when an amount leaves the safe range', () => {
    expect(() => gbp([line('90,071,992,547,409.91', 0, 2)])).toThrow(RangeError);
  });
});

describe('validation', () => {
  it('rejects bad unit prices, naming the line', () => {
    expectInvoiceError(() => gbp([line('1.00'), line('abc')]), 'unitPrice', 1);
    expectInvoiceError(() => gbp([line('19.999')]), 'unitPrice', 0);
    expectInvoiceError(() => gbp([line('-5.00')]), 'unitPrice', 0);
    expectInvoiceError(() => gbp([line(''), line('1.00')]), 'unitPrice', 0);
    expectInvoiceError(() => gbp([line(19.99)]), 'unitPrice', 0);
  });

  it('rejects bad quantities', () => {
    for (const q of [0, -1, 1.5, '2', null]) {
      expectInvoiceError(() => gbp([line('1.00'), line('1.00', 0, q)]), 'quantity', 1);
    }
  });

  it('rejects bad tax rates', () => {
    for (const r of [-1, 12.5, '2000']) {
      expectInvoiceError(() => gbp([line('1.00', r)]), 'taxRateBps', 0);
    }
  });
});
