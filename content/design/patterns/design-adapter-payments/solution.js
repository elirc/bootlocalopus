export class PaymentProviderError extends Error {
  constructor(provider, message, { retryable, cause }) {
    super(message, { cause });
    this.name = 'PaymentProviderError';
    this.provider = provider;
    this.retryable = retryable;
  }
}

function assertAmount(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new TypeError(`amountCents must be a positive integer, got ${amountCents}`);
  }
}

/** 1999 -> '19.99', 5 -> '0.05'. Integer arithmetic only. */
function centsToDecimal(cents) {
  const major = Math.trunc(cents / 100);
  const minor = String(cents % 100).padStart(2, '0');
  return `${major}.${minor}`;
}

/** '19.99' -> 1999, '12.5' -> 1250, '7' -> 700. No floats involved. */
function decimalToCents(text) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!match) throw new TypeError(`unparseable amount "${text}"`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

const LEGACY_RETRYABLE = new Set(['TIMEOUT', 'NETWORK']);

export function adaptLegacy(legacy) {
  return {
    async charge({ amountCents, currency, token }) {
      assertAmount(amountCents);
      const request = { amount: centsToDecimal(amountCents), currency: currency.toLowerCase(), cardToken: token };
      const result = await new Promise((resolve, reject) => {
        legacy.makePayment(request, (err, res) => {
          if (err) {
            reject(new PaymentProviderError('legacy', `legacy payment failed: ${err.code}`, {
              retryable: LEGACY_RETRYABLE.has(err.code),
              cause: err,
            }));
          } else {
            resolve(res);
          }
        });
      });
      if (result.state === 'OK') return { status: 'paid', id: result.ref, amountCents: decimalToCents(result.amount) };
      return { status: 'declined', id: result.ref, reason: 'declined' };
    },
  };
}

export function adaptModern(modern) {
  return {
    async charge({ amountCents, currency, token }) {
      assertAmount(amountCents);
      let result;
      try {
        result = await modern.charges.create({ amount_minor: amountCents, currency: currency.toUpperCase(), source: token });
      } catch (error) {
        const status = error?.statusCode;
        throw new PaymentProviderError('modern', `modern payment failed: ${error?.message}`, {
          retryable: status == null || status >= 500,
          cause: error,
        });
      }
      if (result.status === 'succeeded') return { status: 'paid', id: result.id, amountCents };
      return { status: 'declined', id: result.id, reason: result.failure_reason ?? 'declined' };
    },
  };
}
