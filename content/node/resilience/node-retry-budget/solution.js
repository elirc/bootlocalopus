export function createRetryBudget({ ratio = 0.1, minRetries = 10, windowMs = 10_000, now = Date.now } = {}) {
  // Timestamps in arrival order. now() is monotonic, so expired ones are always at the front.
  const requests = [];
  const retries = [];

  const prune = () => {
    const t = now();
    while (requests.length > 0 && t - requests[0] >= windowMs) requests.shift();
    while (retries.length > 0 && t - retries[0] >= windowMs) retries.shift();
  };

  return {
    recordRequest() {
      prune();
      requests.push(now());
    },

    tryRetry() {
      prune();
      const allowed = Math.max(minRetries, Math.floor(ratio * requests.length));
      if (retries.length >= allowed) return false;
      retries.push(now());
      return true;
    },

    stats() {
      prune();
      return { requests: requests.length, retries: retries.length };
    },
  };
}

export async function callWithBudget(
  fn,
  { budget, maxAttempts = 3, shouldRetry = () => true, delayMs = () => 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) },
) {
  budget.recordRequest();
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      // Cheapest and most local checks first; the shared budget is only spent on a real retry.
      const retry = attempt < maxAttempts && shouldRetry(error) && budget.tryRetry();
      if (!retry) throw error;
      await sleep(delayMs(attempt));
    }
  }
}
