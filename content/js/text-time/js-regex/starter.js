// The code as it is today. Every function here has a bug; one of them is a
// denial-of-service waiting for the right input.

export function parseLogLine(line) {
  // TODO: one anchored pattern with named groups
  return null;
}

export function isSlug(value) {
  return /^([a-z0-9]+-?)+$/.test(value);
}

export function countEmoji(text) {
  return (text.match(/\p{Emoji}/gu) ?? []).length;
}

export function highlight(text, term) {
  return text.replace(new RegExp(term, 'gi'), '<mark>$&</mark>');
}
