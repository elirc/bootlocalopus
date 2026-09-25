export function formatPercent(ratio, locale, { digits = 0, signed = false } = {}) {
  return new Intl.NumberFormat(locale, {
    style: 'percent', // multiplies by 100 itself
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto', // exceptZero: no sign on 0, even after rounding
  }).format(ratio);
}

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'];

export function formatBytes(bytes, locale) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError(`bytes must be a non-negative safe integer, got ${bytes}`);
  }
  let unit = 0;
  let value = bytes;
  while (unit < UNITS.length - 1 && value >= 1000) {
    value /= 1000;
    unit++;
  }
  // 999.95 kB would display as "1,000 kB": step up once more if rounding reaches 1000.
  if (unit < UNITS.length - 1 && Math.round(value * 10) / 10 >= 1000) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SPACES = /^[\s  ]$/;

function separators(locale) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal').value,
  };
}

export function parseLocaleNumber(text, locale) {
  if (typeof text !== 'string') return NaN;
  const { group, decimal } = separators(locale);
  const groupChars = SPACES.test(group) ? `[${escapeRegExp(group)} ]` : escapeRegExp(group);
  const pattern = new RegExp(
    `^(-?)([0-9]+|[0-9]{1,3}(?:${groupChars}[0-9]{3})+)(?:${escapeRegExp(decimal)}([0-9]+))?$`,
  );
  const match = pattern.exec(text.trim());
  if (!match) return NaN;
  const [, sign, integer, fraction] = match;
  const canonical = `${sign}${integer.replace(/[^0-9]/g, '')}${fraction ? `.${fraction}` : ''}`;
  return Number(canonical);
}
