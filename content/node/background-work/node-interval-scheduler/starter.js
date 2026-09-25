export function createScheduler({ now = Date.now, timers = { setTimeout, clearTimeout }, onError = () => {} } = {}) {
  const tasks = new Map();

  // TODO: fixed-rate ticks on a grid, skip while a run is in flight, survive
  // errors, stats, and a stop() that waits for in-flight runs.
  // This version schedules the next run when the last one finishes, so it
  // drifts, and one failure ends the loop.
  return {
    every(name, intervalMs, task) {
      const entry = { runs: 0, skipped: 0, failures: 0 };
      tasks.set(name, entry);
      const loop = () => {
        entry.runs++;
        Promise.resolve(task()).then(() => timers.setTimeout(loop, intervalMs));
      };
      timers.setTimeout(loop, intervalMs);
    },
    stats(name) {
      return tasks.get(name);
    },
    async stop() {},
  };
}
