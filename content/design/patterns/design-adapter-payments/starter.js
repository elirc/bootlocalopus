export class PaymentProviderError extends Error {}

export function adaptLegacy(legacy) {
  return {
    async charge({ amountCents, currency, token }) {
      // TODO: legacy.makePayment({ amount, currency, cardToken }, callback)
      throw new Error('TODO');
    },
  };
}

export function adaptModern(modern) {
  return {
    async charge({ amountCents, currency, token }) {
      // TODO: await modern.charges.create({ amount_minor, currency, source })
      throw new Error('TODO');
    },
  };
}
