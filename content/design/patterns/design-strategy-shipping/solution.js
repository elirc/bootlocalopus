export class ShippingUnavailableError extends Error {
  constructor(id) {
    super(`Shipping method "${id}" is not available for this order`);
    this.name = 'ShippingUnavailableError';
    this.id = id;
  }
}

const FREE_STANDARD_FROM = 5000;
const EXPRESS_INCLUDED_GRAMS = 2000;

export const standard = {
  id: 'standard',
  label: 'Standard (3-5 days)',
  isAvailable: () => true,
  costCents: (order) => (order.subtotalCents >= FREE_STANDARD_FROM ? 0 : 499),
};

export const express = {
  id: 'express',
  label: 'Express (next day)',
  isAvailable: (order) => order.country === 'GB',
  costCents(order) {
    const extraGrams = Math.max(0, order.weightGrams - EXPRESS_INCLUDED_GRAMS);
    return 999 + 150 * Math.ceil(extraGrams / 1000);
  },
};

export const collection = {
  id: 'collection',
  label: 'Click & collect',
  isAvailable: (order) => order.country === 'GB' && order.weightGrams <= 20000,
  costCents: () => 0,
};

export function createShippingQuoter(strategies) {
  const byId = new Map();
  for (const strategy of strategies) {
    if (byId.has(strategy.id)) throw new Error(`Duplicate shipping strategy "${strategy.id}"`);
    byId.set(strategy.id, strategy);
  }

  return {
    quotes(order) {
      return strategies
        .filter((s) => s.isAvailable(order))
        .map((s) => ({ id: s.id, label: s.label, costCents: s.costCents(order) }))
        .sort((a, b) => a.costCents - b.costCents); // Array#sort is stable
    },
    quote(id, order) {
      const strategy = byId.get(id);
      if (!strategy || !strategy.isAvailable(order)) throw new ShippingUnavailableError(id);
      return strategy.costCents(order);
    },
  };
}
