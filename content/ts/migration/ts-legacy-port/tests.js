const { buildReport } = solution;

const CUSTOMERS = [
  { id: 7, name: 'Ada' },
  { id: 12, name: 'Grace' },
];
const RANGE = { from: '2026-03-01', to: '2026-03-31' };

const order = (id, fields = {}) => ({
  id, customerId: '7', totalPence: '1000', discountPence: '0', placedAt: '2026-03-10', status: 'paid', ...fields,
});

describe('buildReport', () => {
  it('matches CSV customer ids to numeric API ids', () => {
    const r = buildReport([order('o1', { customerId: '12' }), order('o2')], CUSTOMERS, RANGE);
    expect(r.rows.map((row) => row.customer)).toEqual(['Grace', 'Ada']);
    expect(r.unknownCustomers).toEqual([]);
  });
  it('computes net pence as a number, with an empty discount meaning 0', () => {
    const r = buildReport([order('o1', { totalPence: '2500', discountPence: '' }), order('o2', { totalPence: '900', discountPence: '150' })], CUSTOMERS, RANGE);
    expect(r.rows.map((row) => row.netPence)).toEqual([2500, 750]);
    expect(typeof r.rows[0].netPence).toBe('number');
  });
  it('totals as a number, not a concatenated string', () => {
    const r = buildReport([order('o1', { totalPence: '100' }), order('o2', { totalPence: '200' }), order('o3', { totalPence: '300' })], CUSTOMERS, RANGE);
    expect(r.totalPence).toBe(600);
  });
  it('totals an empty report to 0', () => {
    expect(buildReport([], CUSTOMERS, RANGE)).toStrictEqual({ rows: [], totalPence: 0, unknownCustomers: [] });
  });
  it('sorts by net pence, biggest first, numerically, ties by order id', () => {
    const r = buildReport([
      order('o-b', { totalPence: '900' }),
      order('o-c', { totalPence: '10000' }),
      order('o-a', { totalPence: '900' }),
      order('o-d', { totalPence: '80' }),
    ], CUSTOMERS, RANGE);
    expect(r.rows.map((row) => row.orderId)).toEqual(['o-c', 'o-a', 'o-b', 'o-d']);
  });
  it('skips cancelled orders and orders outside the inclusive range', () => {
    const r = buildReport([
      order('first-day', { placedAt: '2026-03-01' }),
      order('last-day', { placedAt: '2026-03-31' }),
      order('before', { placedAt: '2026-02-28' }),
      order('after', { placedAt: '2026-04-01' }),
      order('cancelled', { status: 'cancelled' }),
    ], CUSTOMERS, RANGE);
    expect(r.rows.map((row) => row.orderId).sort()).toEqual(['first-day', 'last-day']);
  });
  it('lists unknown customers once each, sorted, and labels their rows', () => {
    const r = buildReport([order('o1', { customerId: '99' }), order('o2', { customerId: '5' }), order('o3', { customerId: '99' })], CUSTOMERS, RANGE);
    expect(r.unknownCustomers).toEqual(['5', '99']);
    expect(r.rows.every((row) => row.customer === 'Unknown customer')).toBe(true);
  });
  it('returns rows with exactly the report fields', () => {
    const r = buildReport([order('o1', { totalPence: '1200', discountPence: '200' })], CUSTOMERS, RANGE);
    expect(r.rows).toStrictEqual([{ orderId: 'o1', customer: 'Ada', netPence: 1000, placedAt: '2026-03-10' }]);
  });
  it('rejects amounts that are not whole pence, naming the field and order', () => {
    expect(() => buildReport([order('o9', { totalPence: '12.50' })], CUSTOMERS, RANGE)).toThrow('Invalid totalPence on order o9');
    expect(() => buildReport([order('o8', { discountPence: 'n/a' })], CUSTOMERS, RANGE)).toThrow('Invalid discountPence on order o8');
    expect(() => buildReport([order('o7', { totalPence: '' })], CUSTOMERS, RANGE)).not.toThrow();
  });
  it('does not validate orders it skips', () => {
    expect(() => buildReport([order('o1', { status: 'cancelled', totalPence: 'junk' })], CUSTOMERS, RANGE)).not.toThrow();
  });
});
