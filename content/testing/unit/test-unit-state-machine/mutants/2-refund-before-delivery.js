export class InvalidTransition extends Error {
  constructor(from, event) {
    super(`cannot ${event} an order that is ${from}`);
    this.name = 'InvalidTransition';
    this.from = from;
    this.event = event;
  }
}

// status -> event -> next status. A status with no entry, or an empty one, is terminal.
const TABLE = {
  cart: { checkout: 'pending_payment', cancel: 'cancelled' },
  pending_payment: { pay: 'paid', payment_failed: 'cart', cancel: 'cancelled' },
  paid: { ship: 'shipped', cancel: 'cancelled', refund: 'refunded' },
  shipped: { deliver: 'delivered' },
  delivered: { refund: 'refunded' },
  cancelled: {},
  refunded: {},
};

export function nextStatus(status, event) {
  // Both usually arrive from an API request, so never trust inherited keys like "toString".
  const row = Object.hasOwn(TABLE, status) ? TABLE[status] : undefined;
  if (!row || !Object.hasOwn(row, event)) throw new InvalidTransition(status, event);
  return row[event];
}

export function allowedEvents(status) {
  if (!Object.hasOwn(TABLE, status)) return [];
  return Object.keys(TABLE[status]).sort();
}
