export function formatPercent(ratio, locale, { digits = 0, signed = false } = {}) {
  return (ratio * 100).toFixed(digits) + '%';
}

export function formatBytes(bytes, locale) {
  return `${bytes} B`;
}

export function parseLocaleNumber(text, locale) {
  return parseFloat(text);
}
