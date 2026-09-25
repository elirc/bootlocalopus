// The code this replaces:
//
// function shippingCost(method, order) {
//   if (method === 'standard') return order.subtotalCents >= 5000 ? 0 : 499;
//   if (method === 'express') { ... }
//   ...
// }

export class ShippingUnavailableError extends Error {}

export const standard = {
  id: 'standard',
  label: 'Standard (3-5 days)',
  isAvailable(order) { return true; },
  costCents(order) { throw new Error('TODO'); },
};

export const express = {};

export const collection = {};

export function createShippingQuoter(strategies) {
  throw new Error('TODO');
}
