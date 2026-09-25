export function createKeyedRunner({ concurrency = 4 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');

  const pending = [];            // { key, task, resolve, reject } in submission order
  const busy = new Set();        // keys with a task running
  const counts = new Map();      // key -> tasks running or pending for it
  let running = 0;
  let idleWaiters = [];

  function release(key) {
    const n = counts.get(key) - 1;
    // Forget the key the moment it has no work, or the map grows forever.
    if (n === 0) counts.delete(key);
    else counts.set(key, n);
  }

  function pump() {
    // Skip over tasks whose key is busy: no head-of-line blocking.
    for (let i = 0; i < pending.length && running < concurrency; ) {
      const item = pending[i];
      if (busy.has(item.key)) { i++; continue; }
      pending.splice(i, 1);
      start(item);
    }
    if (running === 0 && pending.length === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  function start({ key, task, resolve, reject }) {
    running++;
    busy.add(key);
    new Promise((r) => r(task()))
      .then(resolve, reject)
      .finally(() => {
        running--;
        busy.delete(key);
        release(key);
        pump();
      });
  }

  return {
    run(key, task) {
      return new Promise((resolve, reject) => {
        pending.push({ key, task, resolve, reject });
        counts.set(key, (counts.get(key) ?? 0) + 1);
        pump();
      });
    },
    get running() { return running; },
    get pending() { return pending.length; },
    get activeKeys() { return counts.size; },
    onIdle() {
      if (running === 0 && pending.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}
