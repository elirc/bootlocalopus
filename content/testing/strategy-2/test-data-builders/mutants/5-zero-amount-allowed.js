const DAY_MS = 24 * 60 * 60 * 1000;
export const REFUND_WINDOW_DAYS = 30;

/**
 * Decides whether a customer may self-serve a refund for one item of an order.
 * Returns { ok, reasons }: every reason that applies, in a fixed order.
 */
export function checkRefund(order, request) {
  const reasons = [];
  const item = order.items.find((i) => i.sku === request.sku);

  if (order.status !== 'delivered') {
    reasons.push('not-delivered');
  } else if (Date.parse(request.at) - Date.parse(order.deliveredAt) > REFUND_WINDOW_DAYS * DAY_MS) {
    reasons.push('window-closed');
  }
  if (!item) reasons.push('unknown-item');
  else if (item.finalSale) reasons.push('final-sale');
  if (!Number.isInteger(request.amountCents) || request.amountCents < 0) {
    reasons.push('invalid-amount');
  } else if (request.amountCents > order.totalCents - order.refundedCents) {
    reasons.push('exceeds-remaining');
  }
  if (order.customer.blocked) reasons.push('customer-blocked');

  return { ok: reasons.length === 0, reasons };
}
