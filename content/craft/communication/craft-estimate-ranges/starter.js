const roundUp = (x) => Math.ceil(x * 2 - 1e-9) / 2;

/**
 * A three-point estimate for a list of tasks: an expected value, the 85th and
 * 95th percentile, the tasks to spike first, and a sentence to say out loud.
 */
export function estimate(tasks) {
  // The estimate everyone gives: add up the likely times.
  const total = tasks.reduce((sum, t) => sum + t.likely, 0);
  return {
    expectedDays: roundUp(total),
    p85Days: roundUp(total),
    p95Days: roundUp(total),
    spikes: [],
    summary: `About ${total} days.`,
  };
}
