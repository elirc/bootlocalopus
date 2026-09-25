// Same machine as a switch, with a different error message and a Map-based event list.
export class InvalidTransition extends Error {
  constructor(from, event) {
    super('invalid transition');
    this.name = 'InvalidTransition';
    Object.assign(this, { event, from });
  }
}

function step(status, event) {
  switch (status) {
    case 'cart':
      if (event === 'checkout') return 'pending_payment';
      if (event === 'cancel') return 'cancelled';
      return null;
    case 'pending_payment':
      if (event === 'pay') return 'paid';
      if (event === 'payment_failed') return 'cart';
      if (event === 'cancel') return 'cancelled';
      return null;
    case 'paid':
      return event === 'ship' ? 'shipped' : event === 'cancel' ? 'cancelled' : null;
    case 'shipped':
      return event === 'deliver' ? 'delivered' : null;
    case 'delivered':
      return event === 'refund' ? 'refunded' : null;
    default:
      return null;
  }
}

const EVENTS = ['pay', 'ship', 'cancel', 'refund', 'deliver', 'checkout', 'payment_failed'];

export function nextStatus(status, event) {
  const to = step(status, event);
  if (to === null) throw new InvalidTransition(status, event);
  return to;
}

export function allowedEvents(status) {
  return EVENTS.filter((e) => step(status, e) !== null).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
