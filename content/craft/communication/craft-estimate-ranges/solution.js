const roundUp = (x) => Math.ceil(x * 2 - 1e-9) / 2;

const Z85 = 1.04;
const Z95 = 1.645;

function validate(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new RangeError('estimate needs at least one task');
  for (const t of tasks) {
    const nums = [t.best, t.likely, t.worst];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n)) || !(t.best >= 0 && t.best <= t.likely && t.likely <= t.worst)) {
      throw new RangeError(`task "${t.name}": need 0 <= best <= likely <= worst`);
    }
  }
}

/**
 * A three-point estimate for a list of tasks: an expected value, the 85th and
 * 95th percentile, the tasks to spike first, and a sentence to say out loud.
 */
export function estimate(tasks) {
  validate(tasks);

  let mean = 0;
  let variance = 0; // variances add; standard deviations do not
  for (const { best, likely, worst } of tasks) {
    mean += (best + 4 * likely + worst) / 6;
    variance += ((worst - best) / 6) ** 2;
  }
  const sd = Math.sqrt(variance);

  const expectedDays = roundUp(mean);
  const p85Days = roundUp(mean + Z85 * sd);
  const p95Days = roundUp(mean + Z95 * sd);
  const spikes = tasks.filter((t) => t.worst > 3 * t.likely).map((t) => t.name);

  let summary = `Most likely about ${expectedDays} days; 85% confident within ${p85Days} days, 95% within ${p95Days}.`;
  if (spikes.length) summary += ` Spike first: ${spikes.join(', ')}.`;

  return { expectedDays, p85Days, p95Days, spikes, summary };
}
