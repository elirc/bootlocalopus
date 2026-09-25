// Today the rule lives in one function, and support has no idea why a
// customer was refused:
//
//   const eligibleForFreeDelivery = (c) =>
//     c.country === 'GB' && (c.membership === 'active' || c.orderCount >= 3) && c.fraudFlags.length === 0;

export function spec(name, predicate) {
  throw new Error('TODO');
}

export function all(...specs) {
  throw new Error('TODO');
}

export function any(...specs) {
  throw new Error('TODO');
}

export const isMember = undefined;
export const hasOrderedAtLeast = (n) => undefined;
export const livesIn = (country) => undefined;
export const isFlagged = undefined;
export const freeDelivery = undefined;
