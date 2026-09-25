// Same behaviour, written as a table of rules evaluated in order.
export const REFUND_WINDOW_DAYS = 30;

const daysBetween = (fromIso, toIso) => (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;

const RULES = [
  ['not-delivered', (o) => o.status !== 'delivered'],
  ['window-closed', (o, r) => o.status === 'delivered' && daysBetween(o.deliveredAt, r.at) > REFUND_WINDOW_DAYS],
  ['unknown-item', (o, r, item) => item === undefined],
  ['final-sale', (o, r, item) => item !== undefined && item.finalSale === true],
  ['invalid-amount', (o, r) => !(Number.isInteger(r.amountCents) && r.amountCents > 0)],
  ['exceeds-remaining', (o, r) => Number.isInteger(r.amountCents) && r.amountCents > 0 && r.amountCents + o.refundedCents > o.totalCents],
  ['customer-blocked', (o) => Boolean(o.customer.blocked)],
];

export function checkRefund(order, request) {
  const item = order.items.find((i) => i.sku === request.sku);
  const reasons = RULES.filter(([, applies]) => applies(order, request, item)).map(([name]) => name);
  return { ok: !reasons.length, reasons };
}
