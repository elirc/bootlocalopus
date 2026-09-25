/**
 * Turns an order row into the JSON body of GET /orders/:id.
 * The mobile app and the email service both read this shape.
 */
export function toOrderDto(order) {
  return {
    id: order.id,
    status: order.status,
    total: order.totalCents,
    currency: order.currency,
    placedAt: order.placedAt.toISOString(),
    customer: { id: order.customer.id, name: order.customer.name },
    discountCode: order.discountCode ?? null,
    lines: order.lines.map((line) => ({ sku: line.sku, qty: line.qty, unitCents: line.unitCents })),
  };
}
