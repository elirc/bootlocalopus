const MINUTE = 60 * 1000;
const WINDOWS = { '5m': 5 * MINUTE, '30m': 30 * MINUTE, '1h': 60 * MINUTE, '6h': 360 * MINUTE };

export function evaluateSlo({ objective, windowMs = 30 * 24 * 60 * MINUTE }, buckets, now) {
  if (typeof objective !== 'number' || !(objective > 0 && objective < 1)) {
    throw new RangeError('objective must be strictly between 0 and 1');
  }
  for (const b of buckets) {
    const ok = Number.isInteger(b.total) && Number.isInteger(b.errors) && b.errors >= 0 && b.errors <= b.total;
    if (!ok) throw new RangeError('each bucket needs integers 0 <= errors <= total');
  }

  /** Sum first, divide once: a ratio of sums, never an average of ratios. */
  const errorRatio = (w) => {
    let total = 0;
    let errors = 0;
    for (const b of buckets) {
      if (b.start >= now - w && b.start < now) {
        total += b.total;
        errors += b.errors;
      }
    }
    return total === 0 ? 0 : errors / total;
  };

  const budget = 1 - objective;
  const overall = errorRatio(windowMs);
  const burnRates = Object.fromEntries(
    Object.entries(WINDOWS).map(([label, w]) => [label, errorRatio(w) / budget]),
  );

  // Long window: is it significant? Short window: is it still happening?
  let alert = null;
  if (burnRates['1h'] >= 14.4 && burnRates['5m'] >= 14.4) alert = 'page';
  else if (burnRates['6h'] >= 6 && burnRates['30m'] >= 6) alert = 'ticket';

  return { sli: 1 - overall, budgetRemaining: 1 - overall / budget, burnRates, alert };
}
