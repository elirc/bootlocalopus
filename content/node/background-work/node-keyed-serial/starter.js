export function createKeyedRunner({ concurrency = 4 } = {}) {
  let running = 0;

  // TODO: per-key ordering, a global concurrency cap, no head-of-line
  // blocking, activeKeys that drops to 0, and onIdle().
  // This version runs everything at once, so a customer's events race.
  return {
    run(key, task) {
      running++;
      return Promise.resolve()
        .then(task)
        .finally(() => { running--; });
    },
    get running() { return running; },
    get pending() { return 0; },
    get activeKeys() { return 0; },
    onIdle() { return Promise.resolve(); },
  };
}
