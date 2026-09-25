export function evaluateSlo({ objective, windowMs = 30 * 24 * 60 * 60 * 1000 }, buckets, now) {
  // TODO: validate, compute ratio-of-sums per window, burn rates, and the
  // multi-window alert. This version averages per-bucket ratios over
  // everything and pages on any error rate above 1%.
  const ratios = buckets.map((b) => b.errors / b.total);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return {
    sli: 1 - avg,
    budgetRemaining: 1,
    burnRates: { '5m': 0, '30m': 0, '1h': 0, '6h': 0 },
    alert: avg > 0.01 ? 'page' : null,
  };
}
