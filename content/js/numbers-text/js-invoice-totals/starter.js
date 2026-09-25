export class InvoiceError extends Error {
  constructor(message, { line = null, field } = {}) {
    super(message);
    this.line = line;
    this.field = field;
  }
}

export function computeInvoice({ currency, locale, discount, lines }) {
  // 1. minor digits from the currency   2. parse prices and discount
  // 3. validate quantity and rate        4. net   5. allocate discount
  // 6. tax per line, half to even        7. totals, tax groups, formatted strings
  throw new Error('not implemented');
}
