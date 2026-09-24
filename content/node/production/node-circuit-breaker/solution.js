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
  let openedAt = 0;
  let probing = false;
  // Bumped on every transition. A call only reports its result if the
  // breaker is still in the generation that admitted it; anything else is stale.
  let generation = 0;

  const transition = (to) => {
    const from = state;
    state = to;
    probing = false;
    generation++;
    onStateChange(from, to);
  };

  const open = () => {
    openedAt = now();
    transition('open');
  };

  const recordSuccess = () => {
    failures = 0;
    if (state === 'half-open') transition('closed');
  };

  const recordFailure = () => {
    if (state === 'half-open') return open();
    failures++;
    if (failures >= failureThreshold) open();
  };

  /** Run fn once with a timeout. Settles exactly once; a late result is dropped. */
  const attempt = (args) => new Promise((resolve, reject) => {
    let settled = false;
    const timer = timers.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(callTimeoutMs));
    }, callTimeoutMs);
    const finish = (settle) => (value) => {
      if (settled) return; // arrived after the timeout: handled, and ignored
      settled = true;
      timers.clearTimeout(timer);
      settle(value);
    };
    let result;
    try {
      result = Promise.resolve(fn(...args));
    } catch (error) {
      result = Promise.reject(error);
    }
    result.then(finish(resolve), finish(reject));
  });

  const failWith = async (error, args) => {
    if (fallback === undefined) throw error;
    return fallback(error, ...args);
  };

  return {
    get state() { return state; },
    get failures() { return failures; },

    async call(...args) {
      if (state === 'open') {
        if (now() - openedAt < resetTimeoutMs) return failWith(new CircuitOpenError(), args);
        transition('half-open');
      }
      if (state === 'half-open') {
        // Exactly one probe; everyone else is turned away until it reports back.
        if (probing) return failWith(new CircuitOpenError(), args);
        probing = true;
      }

      const admittedIn = generation;
      let value;
      try {
        value = await attempt(args);
      } catch (error) {
        const counted = error instanceof TimeoutError || isFailure(error);
        if (generation === admittedIn) {
          if (counted) recordFailure();
          else recordSuccess();
        }
        // An error the dependency is not to blame for goes straight to the caller.
        if (!counted) throw error;
        return failWith(error, args);
      }
      if (generation === admittedIn) recordSuccess();
      return value;
    },
  };
}
