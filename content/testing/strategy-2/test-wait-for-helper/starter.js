const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The shared helper that makes half the suite flaky: it waits a fixed time,
 * then checks once. Too short under load, too slow everywhere else.
 */
export async function waitFor(check, { timeoutMs = 1000, intervalMs = 50, now = Date.now, sleep = realSleep } = {}) {
  await sleep(timeoutMs);
  return check();
}
