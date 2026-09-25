/** A row from the orders CSV export: every field is a string. */
export interface RawOrder {
  id: string;
  customerId: string;
  totalPence: string;
  discountPence: string;
  placedAt: string; // YYYY-MM-DD
  status: string;
}

/** From the customers API: the id is a number. */
export interface Customer { id: number; name: string }

export interface ReportRow { orderId: string; customer: string; netPence: number; placedAt: string }

export interface Report { rows: ReportRow[]; totalPence: number; unknownCustomers: string[] }

/** Whole pence from a CSV cell. An empty cell is 0; anything else must be digits. */
function pence(value: string, field: string, orderId: string): number {
  if (value === '') return 0;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${field} on order ${orderId}`);
  return Number(value);
}

export function buildReport(orders: readonly RawOrder[], customers: readonly Customer[], range: { from: string; to: string }): Report {
  // One key type for the lookup. The CSV says "42", the API says 42, and 42 === "42" is false.
  const names = new Map(customers.map((c) => [String(c.id), c.name]));
  const unknown = new Set<string>();
  const rows: ReportRow[] = [];

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    // ISO dates compare correctly as strings; the range is inclusive.
    if (order.placedAt < range.from || order.placedAt > range.to) continue;

    const name = names.get(order.customerId);
    if (name === undefined) unknown.add(order.customerId);
    rows.push({
      orderId: order.id,
      customer: name ?? 'Unknown customer',
      netPence: pence(order.totalPence, 'totalPence', order.id) - pence(order.discountPence, 'discountPence', order.id),
      placedAt: order.placedAt,
    });
  }

  // A comparator returns a number. Biggest first, ties by id so the order is stable.
  rows.sort((a, b) => b.netPence - a.netPence || (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0));

  return {
    rows,
    totalPence: rows.reduce((sum, row) => sum + row.netPence, 0),
    unknownCustomers: [...unknown].sort(),
  };
}
