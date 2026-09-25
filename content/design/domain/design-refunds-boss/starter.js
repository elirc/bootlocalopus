export const REFUND_WINDOW_DAYS = 30;

export class DomainError extends Error {}

// Today: refund = Math.round(unitPrice * quantity * (1 - discount / subtotal)),
// computed fresh each time. Refund every item one by one and the customer gets
// back £128.95 of the £128.97 they paid, or £129.01.

export function allocate(total, ratios) {
  throw new Error('TODO');
}

export function evolve(state, event) {
  throw new Error('TODO');
}

export function rehydrate(events) {
  return events.reduce(evolve, null);
}

export function decide(state, command) {
  throw new Error('TODO');
}

export function summarize(state) {
  throw new Error('TODO');
}
