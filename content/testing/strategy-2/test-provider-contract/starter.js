// Your tests run against the correct toOrderDto, the next release (additive
// changes only), and eight breaking changes.

function anOrderRow(overrides = {}) {
  return {
    id: 'ord_7',
    status: 'paid',
    totalCents: 12990,
    currency: 'GBP',
    placedAt: new Date('2024-05-01T09:30:00.000Z'),
    customer: { id: 'cus_1', name: 'Kim Lee' },
    discountCode: 'SPRING10',
    lines: [{ sku: 'TEE', qty: 3, unitCents: 4330 }],
    ...overrides,
  };
}

/** What the consumer actually receives: the body after a JSON round trip. */
const wire = (dto) => JSON.parse(JSON.stringify(dto));

describe('GET /orders/:id contract', () => {
  // This breaks on the next release, which only ADDS fields. Replace it.
  it('serialises an order', () => {
    expect(wire(solution.toOrderDto(anOrderRow()))).toEqual({
      id: 'ord_7',
      status: 'paid',
      totalCents: 12990,
      currency: 'GBP',
      placedAt: '2024-05-01T09:30:00.000Z',
      customer: { id: 'cus_1', name: 'Kim Lee' },
      discountCode: 'SPRING10',
      lines: [{ sku: 'TEE', qty: 3, unitCents: 4330 }],
    });
  });

  // TODO: pin what consumers read; tolerate everything else.
});
