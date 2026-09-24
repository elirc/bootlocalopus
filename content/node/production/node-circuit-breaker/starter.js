export class CircuitOpenError extends Error {
  constructor(message = 'circuit open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class TimeoutError extends Error {
  constructor(ms) {
    super(`call timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

export function createBreaker(fn, {
  failureThreshold = 5,
  resetTimeoutMs = 30_000,
  callTimeoutMs = 5_000,
  fallback,
  isFailure = () => true,
  onStateChange = () => {},
  now = Date.now,
  timers = { setTimeout, clearTimeout },
} = {}) {
  let state = 'closed';
  let failures = 0;

  return {
    get state() { return state; },
    get failures() { return failures; },

    async call(...args) {
      // TODO: closed / open / half-open, a per-call timeout via `timers`,
      // exactly one half-open probe, stale results ignored, and the fallback.
      throw new Error('call() is not implemented yet');
    },
  };
}
