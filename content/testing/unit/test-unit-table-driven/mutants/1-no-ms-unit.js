const UNITS = { h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };
const ORDER = ['h', 'm', 's', 'ms'];

/**
 * "1h30m" -> 5400000. Parts are <whole number><unit>, units h, m, s, ms,
 * largest first, each at most once. Case-insensitive, surrounding whitespace
 * ignored. Anything else -> null.
 */
export function parseDuration(text) {
  if (typeof text !== 'string') return null;
  const input = text.trim().toLowerCase();
  if (input === '') return null;

  const part = /(\d+)(h|m|s|ms)/y;
  let total = 0;
  let lastRank = -1;
  let pos = 0;
  while (pos < input.length) {
    part.lastIndex = pos;
    const match = part.exec(input);
    if (!match) return null;
    const rank = ORDER.indexOf(match[2]);
    if (rank <= lastRank) return null; // out of order, or the same unit twice
    lastRank = rank;
    total += Number(match[1]) * UNITS[match[2]];
    pos = part.lastIndex;
  }
  return total;
}
