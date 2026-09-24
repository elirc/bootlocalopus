// Same behaviour, different mechanics: retry is recursive, and debounce never
// cancels a timer. It ignores every timer except the most recent one.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function retry(fn, options = {}) {
  const { attempts = 3, delayMs = 1000, sleep = wait } = options;
  const attempt = (n, pause) =>
    Promise.resolve()
      .then(() => fn(n))
      .catch(async (error) => {
        if (n >= attempts) throw error;
        await sleep(pause);
        return attempt(n + 1, pause * 2);
      });
  return attempt(1, delayMs);
}

export function debounce(fn, ms, timers = {}) {
  const schedule = timers.setTimeout ?? setTimeout;
  let latest = 0;
  return (...args) => {
    const mine = ++latest;
    schedule(() => {
      if (mine === latest) fn(...args);
    }, ms);
  };
}
