export function parseAmount(text, digits = 2) {
  return Math.round(parseFloat(text) * 10 ** digits);
}

export function formatAmount(minor, digits = 2) {
  return (minor / 10 ** digits).toFixed(digits);
}
