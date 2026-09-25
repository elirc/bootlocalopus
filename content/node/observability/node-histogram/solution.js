const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export function createHistogram({ buckets = DEFAULT_BUCKETS, now = () => performance.now() } = {}) {
  const valid =
    Array.isArray(buckets) &&
    buckets.length > 0 &&
    buckets.every((b, i) => typeof b === 'number' && Number.isFinite(b) && (i === 0 || b > buckets[i - 1]));
  if (!valid) throw new RangeError('buckets must be finite numbers in strictly increasing order');

  const bounds = [...buckets];
  // Per-bucket (non-cumulative) counts; the last slot is the +Inf overflow.
  const counts = new Array(bounds.length + 1).fill(0);
  let sum = 0;
  let count = 0;

  function observe(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('value must be a finite number');
    const i = bounds.findIndex((le) => value <= le);
    counts[i === -1 ? bounds.length : i]++;
    sum += value;
    count++;
  }

  /** [{ le, count }] with cumulative counts, +Inf last. */
  function cumulative() {
    let running = 0;
    return counts.map((c, i) => {
      running += c;
      return { le: i < bounds.length ? bounds[i] : '+Inf', count: running };
    });
  }

  return {
    observe,

    startTimer() {
      const start = now();
      let seconds = null;
      return () => {
        if (seconds === null) {
          seconds = (now() - start) / 1000;
          observe(seconds);
        }
        return seconds;
      };
    },

    snapshot() {
      return { buckets: cumulative(), sum, count };
    },

    quantile(q) {
      if (typeof q !== 'number' || !(q >= 0 && q <= 1)) throw new RangeError('q must be between 0 and 1');
      if (count === 0) return NaN;
      const rank = q * count;
      const cum = cumulative();
      const i = cum.findIndex((b) => b.count >= rank);
      if (i === bounds.length) return bounds[bounds.length - 1];
      const lower = i === 0 ? 0 : bounds[i - 1];
      const upper = bounds[i];
      const below = i === 0 ? 0 : cum[i - 1].count;
      const inBucket = cum[i].count - below;
      if (inBucket === 0) return lower; // only when rank is 0
      return lower + (upper - lower) * ((rank - below) / inBucket);
    },

    text(name) {
      const lines = cumulative().map((b) => `${name}_bucket{le="${String(b.le)}"} ${b.count}`);
      lines.push(`${name}_sum ${String(sum)}`, `${name}_count ${count}`);
      return lines.join('\n') + '\n';
    },
  };
}
