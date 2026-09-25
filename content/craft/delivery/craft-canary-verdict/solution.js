const rate = ({ requests, errors }) => errors / requests;

/** One window: { state: 'healthy' | 'unhealthy' | 'insufficient', reasons }. */
function judgeWindow({ baseline, canary }, policy) {
  // Obviously broken needs no statistics.
  if (canary.errors >= policy.abortAfterErrors) return { state: 'unhealthy', reasons: ['error-rate'] };
  if (canary.requests < policy.minRequests || baseline.requests < policy.minRequests) {
    return { state: 'insufficient', reasons: [] };
  }
  const reasons = [];
  // A difference, not a ratio: a baseline with zero errors must not make one canary error "infinitely worse".
  if (rate(canary) - rate(baseline) > policy.maxErrorRateIncrease) reasons.push('error-rate');
  if (canary.p99Ms > baseline.p99Ms * policy.maxLatencyRatio) reasons.push('latency');
  return { state: reasons.length ? 'unhealthy' : 'healthy', reasons };
}

/**
 * Decides whether to promote, keep watching, or roll back a canary, from its
 * per-window checks (oldest first). Returns { verdict, reasons }.
 */
export function judgeCanary(checks, policy) {
  if (checks.length === 0) return { verdict: 'wait', reasons: [] };

  const latest = judgeWindow(checks.at(-1), policy);
  if (latest.state === 'unhealthy') return { verdict: 'rollback', reasons: latest.reasons };

  const streak = checks.slice(-policy.healthyChecks);
  const promotable = streak.length === policy.healthyChecks
    && streak.every((check) => judgeWindow(check, policy).state === 'healthy');
  return { verdict: promotable ? 'promote' : 'wait', reasons: [] };
}
