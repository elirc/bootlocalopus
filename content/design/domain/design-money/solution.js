/** Minor-unit exponent per currency: 1 GBP = 100 pence, 1 JPY = 1 yen, 1 KWD = 1000 fils. */
export const CURRENCIES = Object.freeze({ GBP: 2, EUR: 2, USD: 2, JPY: 0, KWD: 3 });

export class CurrencyMismatchError extends Error {
  constructor(a, b) {
    super(`Cannot combine ${a} and ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

const checkCurrency = (currency) => {
  if (!Object.hasOwn(CURRENCIES, currency)) throw new RangeError(`Unknown currency ${String(currency)}`);
};

/** Integer division rounding half away from zero, exact for safe integers. */
function divideRounded(numerator, denominator) {
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  if (Math.abs(remainder) * 2 >= denominator) return quotient + Math.sign(numerator);
  return quotient;
}

export class Money {
  #amountMinor;
  #currency;

  constructor(amountMinor, currency) {
    this.#amountMinor = amountMinor === 0 ? 0 : amountMinor; // never -0
    this.#currency = currency;
    Object.freeze(this);
  }

  static of(amountMinor, currency) {
    checkCurrency(currency);
    if (!Number.isSafeInteger(amountMinor)) throw new RangeError(`Amount must be an integer number of minor units, got ${amountMinor}`);
    return new Money(amountMinor, currency);
  }

  static zero(currency) {
    return Money.of(0, currency);
  }

  /** '12.34' -> 1234 pence, by string arithmetic: no float ever touches the amount. */
  static parse(text, currency) {
    checkCurrency(currency);
    const exponent = CURRENCIES[currency];
    const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(typeof text === 'string' ? text.trim() : '');
    if (!m) throw new RangeError(`Not an amount: ${String(text)}`);
    const [, minus, whole, fraction = ''] = m;
    if (fraction.length > exponent) throw new RangeError(`${currency} has ${exponent} decimal places: ${text}`);
    const minor = Number(whole + fraction.padEnd(exponent, '0'));
    return Money.of(minus ? -minor : minor, currency);
  }

  static sum(list, currency) {
    return list.reduce((total, m) => total.add(m), Money.zero(currency));
  }

  get amountMinor() { return this.#amountMinor; }
  get currency() { return this.#currency; }

  #same(other) {
    if (!(other instanceof Money)) throw new TypeError('Expected Money');
    if (other.currency !== this.#currency) throw new CurrencyMismatchError(this.#currency, other.currency);
  }

  add(other) { this.#same(other); return Money.of(this.#amountMinor + other.amountMinor, this.#currency); }
  subtract(other) { this.#same(other); return Money.of(this.#amountMinor - other.amountMinor, this.#currency); }
  negate() { return Money.of(-this.#amountMinor, this.#currency); }

  times(quantity) {
    if (!Number.isInteger(quantity)) throw new RangeError('Quantity must be an integer');
    return Money.of(this.#amountMinor * quantity, this.#currency);
  }

  /** 2000 basis points = 20%. Rounded half away from zero, so a refund rounds like the charge. */
  percentage(basisPoints) {
    if (!Number.isInteger(basisPoints)) throw new RangeError('Basis points must be an integer');
    return Money.of(divideRounded(this.#amountMinor * basisPoints, 10_000), this.#currency);
  }

  compare(other) { this.#same(other); return Math.sign(this.#amountMinor - other.amountMinor); }
  equals(other) {
    return other instanceof Money && other.currency === this.#currency && other.amountMinor === this.#amountMinor;
  }
  isZero() { return this.#amountMinor === 0; }
  isNegative() { return this.#amountMinor < 0; }

  toDecimalString() {
    const exponent = CURRENCIES[this.#currency];
    const digits = String(Math.abs(this.#amountMinor)).padStart(exponent + 1, '0');
    const whole = exponent === 0 ? digits : digits.slice(0, -exponent);
    const fraction = exponent === 0 ? '' : `.${digits.slice(-exponent)}`;
    return `${this.#amountMinor < 0 ? '-' : ''}${whole}${fraction}`;
  }

  toJSON() { return { amountMinor: this.#amountMinor, currency: this.#currency }; }
  toString() { return `${this.toDecimalString()} ${this.#currency}`; }
}
