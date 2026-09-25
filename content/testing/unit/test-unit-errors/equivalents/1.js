// Same contract, hand-written parser, different messages and error construction.
export class PriceError extends Error {
  name = 'PriceError';
  constructor(code, input) {
    super(`Invalid price (${code.toLowerCase()})`);
    this.code = code;
    this.input = input;
  }
}

const isDigits = (s) => s.length > 0 && [...s].every((c) => c >= '0' && c <= '9');

function wholePart(s) {
  if (!s.includes(',')) return isDigits(s) ? Number(s) : null;
  const groups = s.split(',');
  const [head, ...rest] = groups;
  if (!isDigits(head) || head.length > 3) return null;
  if (!rest.every((g) => g.length === 3 && isDigits(g))) return null;
  return Number(groups.join(''));
}

export function parsePrice(text) {
  if (typeof text !== 'string') throw new TypeError(`expected a string, got ${typeof text}`);
  let s = text.trim();
  if (!s) throw new PriceError('EMPTY', text);
  if (s[0] === '£') s = s.slice(1);
  if (s[0] === '-') throw new PriceError('NEGATIVE', text);

  const dot = s.indexOf('.');
  const whole = dot === -1 ? s : s.slice(0, dot);
  const frac = dot === -1 ? '' : s.slice(dot + 1);
  const pounds = wholePart(whole);
  if (pounds === null || (dot !== -1 && !isDigits(frac))) throw new PriceError('FORMAT', text);
  if (frac.length > 2) throw new PriceError('PRECISION', text);
  return pounds * 100 + (frac.length === 0 ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac));
}
