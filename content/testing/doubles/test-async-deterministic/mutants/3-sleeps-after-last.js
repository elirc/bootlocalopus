const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls `fn` until it resolves, at most `attempts` times in total. Waits
 * `delayMs`, then twice that, then twice again, between attempts. Rejects with
 * the last error once every attempt has failed.
 */
export async function retry(fn, { attempts = 3, delayMs = 1000, sleep = realSleep } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      await sleep(delayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/**
 * Returns a function that delays calling `fn` until `ms` have passed with no
 * further calls, then calls it once with the latest arguments (trailing edge).
 */
export function debounce(fn, ms, { setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout } = {}) {
  let timer = null;
  return (...args) => {
    if (timer !== null) cancel(timer);
    timer = schedule(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}
