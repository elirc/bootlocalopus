export class InvoiceError extends Error {
  constructor(message, { line = null, field } = {}) {
    super(message);
    this.name = 'InvoiceError';
    this.line = line;
    this.field = field;
  }
}

// --- parsing: text -> BigInt minor units, or null ---------------------------------
const AMOUNT = /^([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.([0-9]+))?$/;

function parseAmount(text, digits) {
  if (typeof text !== 'string') return null;
  const match = AMOUNT.exec(text.trim());
  if (!match) return null;
  const [, integer, fraction = ''] = match;
  if (fraction.length > digits) return null;
  return BigInt(integer.replaceAll(',', '') + fraction.padEnd(digits, '0'));
}

// --- largest-remainder allocation, all BigInt, amount >= 0 -------------------------
function allocate(amount, weights) {
  const total = weights.reduce((sum, w) => sum + w, 0n);
  if (amount === 0n || total === 0n) return weights.map(() => 0n);
  const shares = weights.map((w, index) => ({ index, base: (amount * w) / total, rem: (amount * w) % total }));
  let leftover = amount - shares.reduce((sum, s) => sum + s.base, 0n);
  const order = shares.toSorted((a, b) => (a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1));
  for (const s of order) {
    if (leftover === 0n) break;
    s.base += 1n;
    leftover -= 1n;
  }
  return shares.map((s) => s.base);
}

// --- amount × bps / 10000, rounded half to even (amount >= 0) ----------------------
function taxHalfEven(amount, bps) {
  const product = amount * BigInt(bps);
  const q = product / 10_000n;
  const twice = 2n * (product % 10_000n);
  return twice > 10_000n || (twice === 10_000n && q % 2n === 1n) ? q + 1n : q;
}

// --- BigInt -> Number, refusing to lose precision ----------------------------------
function toSafe(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`amount ${value} is outside the safe integer range`);
  return n;
}

// Exact decimal string for Intl: 4798n with 2 digits -> "47.98".
function toDecimal(minor, digits) {
  const sign = minor < 0n ? '-' : '';
  const text = (minor < 0n ? -minor : minor).toString().padStart(digits + 1, '0');
  return digits === 0 ? sign + text : `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

export function computeInvoice({ currency, locale, discount: discountText, lines }) {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;

  const parsed = lines.map((line, i) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new InvoiceError(`line ${i}: quantity must be a positive integer`, { line: i, field: 'quantity' });
    }
    if (!Number.isSafeInteger(line.taxRateBps) || line.taxRateBps < 0) {
      throw new InvoiceError(`line ${i}: invalid tax rate`, { line: i, field: 'taxRateBps' });
    }
    const unitPrice = parseAmount(line.unitPrice, digits);
    if (unitPrice === null) {
      throw new InvoiceError(`line ${i}: invalid unit price ${line.unitPrice}`, { line: i, field: 'unitPrice' });
    }
    return { ...line, unitPrice, net: BigInt(line.quantity) * unitPrice };
  });

  const discount = discountText === undefined ? 0n : parseAmount(discountText, digits);
  if (discount === null) throw new InvoiceError(`invalid discount ${discountText}`, { field: 'discount' });

  const subtotal = parsed.reduce((sum, l) => sum + l.net, 0n);
  if (discount > subtotal) throw new InvoiceError('discount exceeds the subtotal', { field: 'discount' });

  const lineDiscounts = allocate(discount, parsed.map((l) => l.net));

  const taxes = new Map(); // rateBps -> { taxable, tax }
  let tax = 0n;
  const outLines = parsed.map((l, i) => {
    const taxable = l.net - lineDiscounts[i];
    const lineTax = taxHalfEven(taxable, l.taxRateBps);
    tax += lineTax;
    const bucket = taxes.get(l.taxRateBps) ?? { taxable: 0n, tax: 0n };
    bucket.taxable += taxable;
    bucket.tax += lineTax;
    taxes.set(l.taxRateBps, bucket);
    return {
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: toSafe(l.unitPrice),
      net: toSafe(l.net),
      discount: toSafe(lineDiscounts[i]),
      taxable: toSafe(taxable),
      tax: toSafe(lineTax),
      total: toSafe(taxable + lineTax),
    };
  });

  const total = subtotal - discount + tax;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const format = (minor) => money.format(toDecimal(minor, digits));

  return {
    currency,
    digits,
    lines: outLines,
    taxes: [...taxes]
      .sort(([a], [b]) => a - b)
      .map(([rateBps, t]) => ({ rateBps, taxable: toSafe(t.taxable), tax: toSafe(t.tax) })),
    subtotal: toSafe(subtotal),
    discount: toSafe(discount),
    tax: toSafe(tax),
    total: toSafe(total),
    formatted: {
      subtotal: format(subtotal),
      discount: format(discount),
      tax: format(tax),
      total: format(total),
    },
  };
}
