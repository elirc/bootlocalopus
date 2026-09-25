export class PriorityPool {
  constructor({ concurrency = 1 } = {}) {
    this.concurrency = concurrency;
    // TODO: the queue (with priorities and insertion order), running count,
    // paused flag, idle waiters.
  }

  get size() {
    return 0;
  }

  get running() {
    return 0;
  }

  run(task, { priority = 0, signal } = {}) {
    return Promise.reject(new Error('not implemented'));
  }

  clear(reason) {}

  pause() {}

  resume() {}

  setConcurrency(n) {}

  onIdle() {
    return Promise.resolve();
  }
}
