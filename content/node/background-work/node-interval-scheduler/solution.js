export function createScheduler({ now = Date.now, timers = { setTimeout, clearTimeout }, onError = () => {} } = {}) {
  const tasks = new Map();
  let stopped = false;

  function schedule(entry) {
    // The next grid point strictly after now: late timers never cause a burst.
    const elapsed = now() - entry.start;
    const k = Math.max(entry.k + 1, Math.floor(elapsed / entry.intervalMs) + 1);
    entry.k = k;
    const due = entry.start + k * entry.intervalMs;
    entry.timer = timers.setTimeout(() => tick(entry), Math.max(0, due - now()));
  }

  function tick(entry) {
    entry.timer = null;
    if (stopped) return;
    if (entry.inFlight) {
      entry.skipped++;
    } else {
      entry.runs++;
      // new Promise turns a synchronous throw into a rejection as well.
      entry.inFlight = new Promise((resolve) => resolve(entry.task()))
        .catch((error) => {
          entry.failures++;
          onError(entry.name, error);
        })
        .finally(() => { entry.inFlight = null; });
    }
    schedule(entry);
  }

  return {
    every(name, intervalMs, task) {
      if (!Number.isInteger(intervalMs) || intervalMs <= 0) throw new RangeError('intervalMs must be a positive integer');
      if (stopped) throw new Error('scheduler is stopped');
      if (tasks.has(name)) throw new Error(`"${name}" is already scheduled`);
      const entry = { name, intervalMs, task, start: now(), k: 0, timer: null, inFlight: null, runs: 0, skipped: 0, failures: 0 };
      tasks.set(name, entry);
      schedule(entry);
    },

    stats(name) {
      const entry = tasks.get(name);
      return entry && { runs: entry.runs, skipped: entry.skipped, failures: entry.failures };
    },

    async stop() {
      stopped = true;
      for (const entry of tasks.values()) {
        if (entry.timer !== null) timers.clearTimeout(entry.timer);
        entry.timer = null;
      }
      await Promise.all([...tasks.values()].map((e) => e.inFlight));
    },
  };
}
