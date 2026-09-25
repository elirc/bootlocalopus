const realTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export function repeat(task, intervalMs, { timers = realTimers, onError } = {}) {
  const controller = new AbortController();
  let timer = null;
  let running = null; // the promise of the run in progress
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    timer = timers.setTimeout(run, intervalMs);
  };

  function run() {
    timer = null;
    running = (async () => {
      try {
        await task({ signal: controller.signal });
      } catch (error) {
        try {
          onError?.(error);
        } catch {
          // A broken error handler must not kill the loop either.
        }
      }
    })();
    // Fixed delay: the next run is scheduled only after this one settles.
    running.then(() => {
      running = null;
      schedule();
    });
  }

  schedule();

  return {
    stop() {
      if (!stopped) {
        stopped = true;
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
        controller.abort();
      }
      // `running` never rejects: errors were handled inside the run.
      return running ?? Promise.resolve();
    },
  };
}
