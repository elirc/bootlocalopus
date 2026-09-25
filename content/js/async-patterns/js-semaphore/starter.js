export class Semaphore {
  constructor(permits) {
    this.permits = permits;
  }

  get available() {
    return 0;
  }

  get waiting() {
    return 0;
  }

  acquire({ signal } = {}) {
    throw new Error('not implemented');
  }

  async use(fn) {
    throw new Error('not implemented');
  }
}
