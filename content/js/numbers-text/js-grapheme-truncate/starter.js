export function graphemeLength(text) {
  return text.length;
}

export function truncate(text, max, ellipsis = '…') {
  return text.length <= max ? text : text.slice(0, max - 1) + ellipsis;
}

export function truncateBytes(text, maxBytes) {
  return text.slice(0, maxBytes);
}

export function countWords(text, locale) {
  return text.split(' ').length;
}
