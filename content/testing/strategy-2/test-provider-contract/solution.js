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
const body = (overrides) => wire(solution.toOrderDto(anOrderRow(overrides)));

describe('GET /orders/:id contract', () => {
  it('has the fields consumers read, with their values (extra fields allowed)', () => {
    expect(body()).toMatchObject({
      id: 'ord_7',
      status: 'paid',
      totalCents: 12990,
      currency: 'GBP',
      customer: { id: 'cus_1', name: 'Kim Lee' },
      discountCode: 'SPRING10',
    });
  });

  it('sends totalCents as an integer number', () => {
    const { totalCents } = body({ totalCents: 12990 });
    expect(typeof totalCents).toBe('number');
    expect(Number.isInteger(totalCents)).toBe(true);
    expect(totalCents).toBe(12990);
  });

  it('sends placedAt as an ISO 8601 UTC string with milliseconds', () => {
    const { placedAt } = body({ placedAt: new Date('2024-05-01T09:30:00.000Z') });
    expect(placedAt).toBe('2024-05-01T09:30:00.000Z');
    expect(placedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('sends every status in lower case, as one of the known values', () => {
    for (const status of ['pending', 'paid', 'shipped', 'cancelled']) {
      expect(body({ status }).status).toBe(status);
    }
  });

  it('sends discountCode: null, not a missing key, when there is no discount', () => {
    const dto = body({ discountCode: null });
    expect(Object.hasOwn(dto, 'discountCode')).toBe(true);
    expect(dto.discountCode).toBeNull();
  });

  it('sends lines as an array of sku, qty and unitCents (extra line fields allowed)', () => {
    const dto = body({ lines: [{ sku: 'TEE', qty: 3, unitCents: 4330 }, { sku: 'HAT', qty: 1, unitCents: 1500 }] });
    expect(dto.lines).toMatchObject([
      { sku: 'TEE', qty: 3, unitCents: 4330 },
      { sku: 'HAT', qty: 1, unitCents: 1500 },
    ]);
  });

  it('sends lines: [] for an order with no lines', () => {
    expect(body({ lines: [] }).lines).toEqual([]);
  });
});
