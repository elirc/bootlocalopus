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

const isNonNegativeInteger = (v) => Number.isInteger(v) && v >= 0;

export function resolveOptions(options = {}) {
  for (const key of Object.keys(options)) {
    if (!KNOWN.includes(key)) {
      const suggestion = closest(key, KNOWN);
      throw new TypeError(`Unknown option "${key}".${suggestion ? ` Did you mean "${suggestion}"?` : ''}`);
    }
  }

  // `undefined` means "not given"; 0, false and '' are real choices.
  const pick = (key) => (options[key] === undefined ? DEFAULTS[key] : options[key]);

  const { baseUrl } = options;
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new TypeError('Option "baseUrl" must be an http(s) URL');
  }

  const timeoutMs = pick('timeoutMs');
  if (!isNonNegativeInteger(timeoutMs)) throw new TypeError('Option "timeoutMs" must be a non-negative integer');

  const retries = pick('retries');
  if (!isNonNegativeInteger(retries)) throw new TypeError('Option "retries" must be a non-negative integer');

  const keepAlive = pick('keepAlive');
  if (typeof keepAlive !== 'boolean') throw new TypeError('Option "keepAlive" must be a boolean');

  const retryOn = pick('retryOn');
  if (!Array.isArray(retryOn)) throw new TypeError('Option "retryOn" must be an array of status codes');

  // Nested defaults merge one level down; the caller's object is copied, not kept.
  const headers = { ...DEFAULTS.headers };
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }

  return Object.freeze({
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeoutMs,
    retries,
    retryOn: Object.freeze([...retryOn]),
    headers: Object.freeze(headers),
    keepAlive,
  });
}
