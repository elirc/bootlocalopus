// sign, integer part (plain or comma-grouped), optional fraction of 1+ digits.
const AMOUNT = /^(-?)([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.([0-9]+))?$/;

export function parseAmount(text, digits = 2) {
  if (typeof text !== 'string') return null;
  const match = AMOUNT.exec(text.trim());
  if (!match) return null;

  const [, sign, integer, fraction = ''] = match;
  if (fraction.length > digits) return null;

  // Build the value from digits: "1,234.5" with 2 digits -> "1234" + "50".
  const digitsOnly = integer.replaceAll(',', '') + fraction.padEnd(digits, '0');
  const magnitude = Number(digitsOnly);
  if (!Number.isSafeInteger(magnitude)) return null;

  return sign === '-' && magnitude !== 0 ? -magnitude : magnitude;
}

export function formatAmount(minor, digits = 2) {
  const sign = minor < 0 ? '-' : '';
  const text = String(Math.abs(minor)).padStart(digits + 1, '0');
  if (digits === 0) return sign + text;
  return `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}
