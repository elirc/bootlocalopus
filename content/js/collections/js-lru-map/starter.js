export class LruCache {
  constructor({ max, onEvict } = {}) {
    this.max = max;
    this.onEvict = onEvict;
  }

  get(key) {
    return undefined;
  }

  set(key, value) {
    throw new Error('not implemented');
  }

  has(key) {
    return false;
  }

  peek(key) {
    return undefined;
  }

  delete(key) {
    return false;
  }

  get size() {
    return 0;
  }

  keys() {
    return [];
  }
}
