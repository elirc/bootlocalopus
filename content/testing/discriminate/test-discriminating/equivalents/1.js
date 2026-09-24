// Same behaviour, different strategy: split into words, then add whole words while they fit.
const ACCENTS = /[̀-ͯ]/g;

export function slugify(title, options = {}) {
  const maxLength = options.maxLength ?? 60;
  const words = title
    .normalize('NFKD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .filter((word) => word !== '');

  let out = '';
  for (const word of words) {
    const next = out === '' ? word : `${out}-${word}`;
    if (next.length > maxLength) break;
    out = next;
  }
  // A first word longer than the limit is cut hard rather than dropped.
  if (out === '' && words.length > 0) return words[0].slice(0, maxLength);
  return out;
}
