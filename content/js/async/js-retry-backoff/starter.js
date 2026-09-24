// TODO: this wait ignores the signal. Make it reject with signal.reason as
// soon as the signal aborts (and clear the timer when it does).
const defaultSleep = (ms, signal) => new Promise((r) => setTimeout(r, ms));

export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    baseDelay = 10,
    factor = 2,
    jitter = (ms) => ms,
    shouldRetry = () => true,
    sleep = defaultSleep,
    signal,
  } = options;

  // TODO
}
