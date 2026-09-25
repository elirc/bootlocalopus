export function hedge(fn, { delayMs, maxAttempts = 2, timers = { setTimeout, clearTimeout }, signal } = {}) {
  // TODO: start attempt 1, hedge with attempt 2 after delayMs, first success
  // wins, abort the losers, clean up the timer and the signal listener.
  return Promise.reject(new Error('not implemented'));
}
