export function createHistogram({ buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], now = () => performance.now() } = {}) {
  const values = [];

  // TODO: bucket counts (cumulative, with +Inf), sum and count, a timer in
  // seconds, quantile estimation from buckets, and the text format.
  // This version keeps every value and reports the average, which hides the tail.
  return {
    observe(value) { values.push(value); },
    startTimer() {
      const start = now();
      return () => now() - start;
    },
    snapshot() {
      return { buckets: [], sum: values.reduce((a, b) => a + b, 0), count: values.length };
    },
    quantile(q) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    },
    text(name) {
      return '';
    },
  };
}
