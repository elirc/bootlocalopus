export class Channel {
  constructor({ highWaterMark = Infinity, onCancel } = {}) {
    this.highWaterMark = highWaterMark;
    this.onCancel = onCancel;
  }

  get size() {
    return 0;
  }

  push(value) {
    throw new Error('not implemented');
  }

  close() {}

  fail(error) {}

  async next() {
    return { value: undefined, done: true };
  }

  async return() {
    return { value: undefined, done: true };
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
