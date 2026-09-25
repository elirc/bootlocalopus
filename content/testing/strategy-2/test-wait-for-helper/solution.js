const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls `check` until it stops throwing, and resolves with what it returned.
 * Checks at least once, never sleeps past the deadline, checks one last time
 * at the deadline, and on timeout rejects with the last failure as the cause.
 */
export async function waitFor(check, { timeoutMs = 1000, intervalMs = 50, now = Date.now, sleep = realSleep } = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    let lastError;
    try {
      return await check();
    } catch (error) {
      lastError = error;
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`waitFor timed out after ${timeoutMs}ms: ${detail}`, { cause: lastError });
    }
    await sleep(Math.min(intervalMs, remaining));
  }
}
