/**
 * Turns an order row into the JSON body of GET /orders/:id.
 * The mobile app and the email service both read this shape.
 */
export function toOrderDto(order) {
  return {
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    placedAt: order.placedAt.toISOString(),
    customer: { id: order.customer.id, name: order.customer.name },
    discountCode: order.discountCode ?? null,
    lines: order.lines.length === 0 ? undefined : order.lines.map((line) => ({ sku: line.sku, qty: line.qty, unitCents: line.unitCents })),
  };
}
