// Grapheme boundaries do not depend on the locale, so one segmenter serves everyone.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const encoder = new TextEncoder();

const clusters = (text) => Array.from(graphemes.segment(text), (s) => s.segment);

export function graphemeLength(text) {
  let n = 0;
  for (const _ of graphemes.segment(text)) n++;
  return n;
}

export function truncate(text, max, ellipsis = '…') {
  const reserved = graphemeLength(ellipsis);
  if (!Number.isInteger(max) || max < reserved) {
    throw new RangeError(`max must be an integer of at least ${reserved}, got ${max}`);
  }
  const parts = clusters(text);
  if (parts.length <= max) return text;
  return parts.slice(0, max - reserved).join('').trimEnd() + ellipsis;
}

export function truncateBytes(text, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError(`maxBytes must be a non-negative integer, got ${maxBytes}`);
  }
  let out = '';
  let used = 0;
  for (const { segment } of graphemes.segment(text)) {
    const size = encoder.encode(segment).length;
    if (used + size > maxBytes) break;
    out += segment;
    used += size;
  }
  return out;
}

export function countWords(text, locale) {
  const words = new Intl.Segmenter(locale, { granularity: 'word' });
  let n = 0;
  for (const s of words.segment(text)) if (s.isWordLike) n++;
  return n;
}
