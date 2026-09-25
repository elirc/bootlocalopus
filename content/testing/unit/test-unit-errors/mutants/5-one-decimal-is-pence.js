/** A price the user typed that cannot be accepted. `code` is the contract; the message is prose. */
export class PriceError extends Error {
  constructor(code, input) {
    super(`${code}: cannot read ${JSON.stringify(input)} as a price`);
    this.name = 'PriceError';
    this.code = code;
    this.input = input;
  }
}

// "12", "12.5", "£1,234.56": thousands separators are optional, but must group by three.
const SHAPE = /^£?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

/** "£12.50" -> 1250 (integer pence). */
export function parsePrice(text) {
  if (typeof text !== 'string') throw new TypeError('parsePrice expects a string');
  const input = text.trim();
  if (input === '') throw new PriceError('EMPTY', text);
  if (input.startsWith('-') || input.startsWith('£-')) throw new PriceError('NEGATIVE', text);

  const match = SHAPE.exec(input);
  if (!match) throw new PriceError('FORMAT', text);
  const [, whole, fraction = ''] = match;
  if (fraction.length > 2) throw new PriceError('PRECISION', text);

  const pounds = Number(whole.replaceAll(',', ''));
  const pence = Number(fraction);
  return pounds * 100 + pence;
}
