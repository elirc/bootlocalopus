export class TaskQueue {
  constructor({ concurrency = 1 } = {}) {
    this.concurrency = concurrency;
    // TODO: pending list, running count, abort controller, idle waiters
  }

  get size() {}

  get running() {}

  push(task) {}

  onIdle() {}

  abort(reason) {}
}
