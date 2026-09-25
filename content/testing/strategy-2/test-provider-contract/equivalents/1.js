// The next release: new fields for a new screen, keys in a different order.
// Every consumer that reads only what it needs is unaffected.
export function toOrderDto(order) {
  const lines = order.lines.map((line) => ({
    lineTotalCents: line.qty * line.unitCents,
    unitCents: line.unitCents,
    qty: line.qty,
    sku: line.sku,
  }));
  return {
    id: order.id,
    lines,
    itemCount: lines.reduce((n, line) => n + line.qty, 0),
    customer: { name: order.customer.name, id: order.customer.id, tier: order.customer.tier ?? 'standard' },
    placedAt: order.placedAt.toJSON(),
    currency: order.currency,
    totalCents: order.totalCents,
    status: order.status,
    discountCode: order.discountCode === undefined ? null : order.discountCode,
    links: { self: `/orders/${order.id}` },
  };
}
