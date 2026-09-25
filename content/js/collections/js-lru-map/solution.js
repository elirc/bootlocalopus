export class LruCache {
  // Insertion order is recency order: the first key is the least recently used.
  #map = new Map();
  #max;
  #onEvict;

  constructor({ max, onEvict } = {}) {
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError(`max must be a positive integer, got ${max}`);
    }
    this.#max = max;
    this.#onEvict = onEvict;
  }

  get(key) {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key);
    this.#touch(key, value);
    return value;
  }

  set(key, value) {
    this.#touch(key, value);
    if (this.#map.size > this.#max) {
      const [oldestKey, oldestValue] = this.#map.entries().next().value;
      this.#map.delete(oldestKey);
      this.#onEvict?.(oldestKey, oldestValue);
    }
    return this;
  }

  has(key) {
    return this.#map.has(key);
  }

  peek(key) {
    return this.#map.get(key);
  }

  delete(key) {
    return this.#map.delete(key);
  }

  get size() {
    return this.#map.size;
  }

  keys() {
    return [...this.#map.keys()];
  }

  // Move `key` to the most-recently-used end.
  #touch(key, value) {
    this.#map.delete(key);
    this.#map.set(key, value);
  }
}
