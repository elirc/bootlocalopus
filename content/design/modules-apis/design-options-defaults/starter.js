export const DEFAULTS = Object.freeze({
  timeoutMs: 10_000,
  retries: 2,
  retryOn: Object.freeze([502, 503, 504]),
  headers: Object.freeze({ accept: 'application/json' }),
  keepAlive: true,
});

const KNOWN = ['baseUrl', ...Object.keys(DEFAULTS)];

/** Given: the known option closest to `word` (edit distance ≤ 2), or null. */
export function closest(word, candidates) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  };
  let best = null;
  let bestDistance = 3;
  for (const c of candidates) {
    const d = distance(word.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  return best;
}

// The version that ships first. It "works" in the demo.
export function resolveOptions(options = {}) {
  return {
    ...DEFAULTS,
    ...options,
    timeoutMs: options.timeoutMs || DEFAULTS.timeoutMs,
    retries: options.retries || DEFAULTS.retries,
  };
}
