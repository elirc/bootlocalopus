export function createRetryBudget({ ratio = 0.1, minRetries = 10, windowMs = 10_000, now = Date.now } = {}) {
  return {
    recordRequest() {
      // TODO
    },

    tryRetry() {
      // TODO: allow retries up to max(minRetries, floor(ratio * requests)) in the window.
      return true;
    },

    stats() {
      return { requests: 0, retries: 0 };
    },
  };
}

export async function callWithBudget(
  fn,
  { budget, maxAttempts = 3, shouldRetry = () => true, delayMs = () => 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) },
) {
  // A plain "try 3 times": the retry storm from the brief.
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
