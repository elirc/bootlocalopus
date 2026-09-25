/** A valid, delivered order. Override only what your test is about. */
function anOrder(overrides = {}) {
  return {
    id: 'ord_1',
    status: 'delivered',
    deliveredAt: '2024-05-01T12:00:00.000Z',
    totalCents: 5000,
    refundedCents: 0,
    ...overrides,
    customer: { id: 'cus_1', blocked: false, ...overrides.customer },
    items: overrides.items ?? [anItem({ sku: 'MUG', priceCents: 2000 }), anItem({ sku: 'TEE', priceCents: 3000 })],
  };
}

function anItem(overrides = {}) {
  return { sku: 'MUG', priceCents: 2000, finalSale: false, ...overrides };
}

/** A valid request for the MUG, nine days after delivery. */
function aRequest(overrides = {}) {
  return { sku: 'MUG', amountCents: 2000, at: '2024-05-10T09:00:00.000Z', ...overrides };
}

const refused = (...reasons) => ({ ok: false, reasons });
const DELIVERED = Date.parse('2024-05-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAfterDelivery = (days, extraMs = 0) => new Date(DELIVERED + days * DAY + extraMs).toISOString();

describe('checkRefund', () => {
  it('accepts a normal refund (the builders are valid)', () => {
    expect(solution.checkRefund(anOrder(), aRequest())).toEqual({ ok: true, reasons: [] });
  });

  it('refuses an order that has not been delivered, without a window check', () => {
    const order = anOrder({ status: 'shipped', deliveredAt: null });
    expect(solution.checkRefund(order, aRequest())).toEqual(refused('not-delivered'));
  });

  it('keeps the window open at exactly 30 days and closes it just after', () => {
    expect(solution.checkRefund(anOrder(), aRequest({ at: daysAfterDelivery(30) }))).toEqual({ ok: true, reasons: [] });
    expect(solution.checkRefund(anOrder(), aRequest({ at: daysAfterDelivery(30, 1) }))).toEqual(refused('window-closed'));
  });

  it('refuses an item that is not in the order', () => {
    expect(solution.checkRefund(anOrder(), aRequest({ sku: 'HAT' }))).toEqual(refused('unknown-item'));
  });

  it('refuses a final-sale item, but only the one requested', () => {
    const order = anOrder({ items: [anItem({ sku: 'MUG', finalSale: true }), anItem({ sku: 'TEE' })] });
    expect(solution.checkRefund(order, aRequest({ sku: 'MUG' }))).toEqual(refused('final-sale'));
    expect(solution.checkRefund(order, aRequest({ sku: 'TEE' }))).toEqual({ ok: true, reasons: [] });
  });

  it('refuses a zero or fractional amount', () => {
    expect(solution.checkRefund(anOrder(), aRequest({ amountCents: 0 }))).toEqual(refused('invalid-amount'));
    expect(solution.checkRefund(anOrder(), aRequest({ amountCents: 10.5 }))).toEqual(refused('invalid-amount'));
  });

  it('counts what was already refunded', () => {
    const order = anOrder({ totalCents: 5000, refundedCents: 4000 });
    expect(solution.checkRefund(order, aRequest({ amountCents: 1000 }))).toEqual({ ok: true, reasons: [] });
    expect(solution.checkRefund(order, aRequest({ amountCents: 1001 }))).toEqual(refused('exceeds-remaining'));
  });

  it('refuses a blocked customer', () => {
    expect(solution.checkRefund(anOrder({ customer: { blocked: true } }), aRequest())).toEqual(refused('customer-blocked'));
  });

  it('reports every reason that applies, in order', () => {
    const order = anOrder({ status: 'cancelled', deliveredAt: null, customer: { blocked: true } });
    expect(solution.checkRefund(order, aRequest({ sku: 'HAT', amountCents: 0 }))).toEqual(
      refused('not-delivered', 'unknown-item', 'invalid-amount', 'customer-blocked'),
    );
  });
});
