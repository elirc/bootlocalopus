export class TimeoutError extends Error {}

export function withTimeout(fn, ms, { signal, timers = globalThis } = {}) {
  // The classic race: the work keeps running, the timer leaks, and the
  // caller's signal is ignored.
  return Promise.race([
    fn(new AbortController().signal),
    new Promise((_, reject) => timers.setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}
