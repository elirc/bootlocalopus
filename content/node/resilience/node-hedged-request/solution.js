export function hedge(fn, { delayMs, maxAttempts = 2, timers = { setTimeout, clearTimeout }, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const controllers = new Map(); // attempt -> AbortController, for attempts in flight
    const errors = [];
    let started = 0;
    let timer;
    let settled = false;

    const clearTimer = () => {
      if (timer !== undefined) timers.clearTimeout(timer);
      timer = undefined;
    };

    const finish = (settle, value) => {
      settled = true;
      clearTimer();
      signal?.removeEventListener('abort', onAbort);
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
      settle(value);
    };

    const onAbort = () => finish(reject, signal.reason);

    const armTimer = () => {
      clearTimer();
      if (started < maxAttempts) timer = timers.setTimeout(onTimer, delayMs);
    };

    const onTimer = () => {
      timer = undefined;
      if (!settled && started < maxAttempts) launch();
    };

    const launch = () => {
      const attempt = ++started;
      const controller = new AbortController();
      controllers.set(attempt, controller);
      armTimer();

      let result;
      try {
        result = Promise.resolve(fn(controller.signal, attempt));
      } catch (error) {
        result = Promise.reject(error);
      }
      // Always handled, so a loser's late rejection is never "unhandled".
      result.then(
        (value) => {
          if (settled) return;
          controllers.delete(attempt);
          finish(resolve, value);
        },
        (error) => {
          if (settled) return;
          controllers.delete(attempt);
          errors[attempt - 1] = error;
          if (controllers.size > 0) return; // another attempt may still win
          if (started < maxAttempts) launch(); // nobody left in flight: do not wait for the timer
          else finish(reject, new AggregateError(errors, 'all hedged attempts failed'));
        },
      );
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    launch();
  });
}
