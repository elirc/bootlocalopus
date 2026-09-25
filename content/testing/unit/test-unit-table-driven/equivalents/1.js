// Same behaviour as one anchored regular expression.
const FULL = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)ms)?$/i;

export function parseDuration(text) {
  if (typeof text !== 'string') return null;
  const m = FULL.exec(text.trim());
  if (!m || m.slice(1).every((g) => g === undefined)) return null;
  const [h = 0, min = 0, s = 0, ms = 0] = m.slice(1).map((g) => (g === undefined ? 0 : Number(g)));
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}
