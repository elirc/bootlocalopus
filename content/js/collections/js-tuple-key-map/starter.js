export class TupleMap {
  #map = new Map();

  set(key, value) {
    this.#map.set(JSON.stringify(key), value);
    return this;
  }

  get(key) {
    return this.#map.get(JSON.stringify(key));
  }

  has(key) {
    return this.#map.has(JSON.stringify(key));
  }

  delete(key) {
    return this.#map.delete(JSON.stringify(key));
  }

  get size() {
    return this.#map.size;
  }

  entries() {
    return [];
  }
}
