export function retryDecision(attempt, failure, { maxAttempts = 3, baseMs = 100, maxDelayMs = 10_000, now = Date.now, random = Math.random } = {}) {
  // The policy most clients ship with: anything that is not a 2xx is worth
  // another go, a fixed delay later. See the brief for what that breaks.
  if (attempt >= maxAttempts) return { retry: false, reason: 'attempts-exhausted' };
  return { retry: true, delayMs: baseMs };
}
