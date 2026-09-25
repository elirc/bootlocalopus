/** Minor-unit exponent per currency: 1 GBP = 100 pence, 1 JPY = 1 yen, 1 KWD = 1000 fils. */
export const CURRENCIES = Object.freeze({ GBP: 2, EUR: 2, USD: 2, JPY: 0, KWD: 3 });

export class CurrencyMismatchError extends Error {}

// Today: `price: 12.34` as a float, `total * 1.2` for VAT, and `.toFixed(2)`
// sprinkled wherever it looked wrong.

export class Money {
  static of(amountMinor, currency) {
    throw new Error('TODO');
  }

  static zero(currency) {
    throw new Error('TODO');
  }

  static parse(text, currency) {
    throw new Error('TODO');
  }

  static sum(list, currency) {
    throw new Error('TODO');
  }
}
