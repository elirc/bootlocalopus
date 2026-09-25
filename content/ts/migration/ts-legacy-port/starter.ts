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

// report.js, pasted in with `any` so it compiles. It has been "mostly right" for years.
export function buildReport(orders: any[], customers: any[], range: any): Report {
  const rows: any[] = [];
  const unknownCustomers: any[] = [];
  for (const order of orders) {
    if (order.status == 'cancelled') continue;
    if (order.placedAt < range.from || order.placedAt > range.to) continue;
    const customer = customers.find((c) => c.id === order.customerId);
    if (!customer) unknownCustomers.push(order.customerId);
    rows.push({
      orderId: order.id,
      customer: customer ? customer.name : 'Unknown customer',
      netPence: order.totalPence - parseInt(order.discountPence),
      placedAt: order.placedAt,
    });
  }
  rows.sort((a, b) => (a.netPence < b.netPence ? 1 : -1));
  return {
    rows,
    totalPence: rows.reduce((sum, row) => sum + row.netPence, ''),
    unknownCustomers,
  };
}
