// Your tests run against the correct checkRefund, a rewrite, and six bugs.

/** A valid, delivered order. Override only what your test is about. */
function anOrder(overrides = {}) {
  return {
    id: 'ord_1',
    status: 'delivered',
    deliveredAt: '2024-05-01T12:00:00.000Z',
    totalCents: 5000,
    refundedCents: 0,
    ...overrides,
    // Nested objects are built fresh every call, and merged, not replaced.
    customer: { id: 'cus_1', blocked: false, ...overrides.customer },
    items: overrides.items ?? [
      { sku: 'MUG', priceCents: 2000, finalSale: false },
      { sku: 'TEE', priceCents: 3000, finalSale: false },
    ],
  };
}

/** A valid request for the MUG, nine days after delivery. */
function aRequest(overrides = {}) {
  return { sku: 'MUG', amountCents: 2000, at: '2024-05-10T09:00:00.000Z', ...overrides };
}

describe('checkRefund', () => {
  // The copy-paste way: which of these fields is this test about?
  it('refuses a refund on an order that has not been delivered', () => {
    const order = {
      id: 'ord_9',
      status: 'shipped',
      deliveredAt: null,
      totalCents: 5000,
      refundedCents: 0,
      customer: { id: 'cus_9', blocked: false },
      items: [{ sku: 'MUG', priceCents: 2000, finalSale: false }],
    };
    const result = solution.checkRefund(order, { sku: 'MUG', amountCents: 2000, at: '2024-05-10T09:00:00.000Z' });
    expect(result.ok).toBe(false);
  });

  it('accepts a normal refund', () => {
    expect(solution.checkRefund(anOrder(), aRequest())).toEqual({ ok: true, reasons: [] });
  });

  // TODO: one rule broken per test, and assert the whole result.
});
