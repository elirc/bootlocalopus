export class Seq {
  // A function that returns a fresh iterator each time, so a Seq is re-iterable.
  #open;

  constructor(open) {
    this.#open = open;
  }

  static from(iterable) {
    return new Seq(() => iterable[Symbol.iterator]());
  }

  [Symbol.iterator]() {
    return this.#open();
  }

  map(fn) {
    const upstream = this;
    return new Seq(function* () {
      let index = 0;
      for (const value of upstream) yield fn(value, index++);
    });
  }

  filter(fn) {
    const upstream = this;
    return new Seq(function* () {
      let index = 0;
      for (const value of upstream) {
        if (fn(value, index++)) yield value;
      }
    });
  }

  take(n) {
    const upstream = this;
    return new Seq(function* () {
      if (n <= 0) return; // never touch the source
      let count = 0;
      for (const value of upstream) {
        yield value;
        // Stop *before* asking upstream for another item. Returning from
        // inside for...of calls the upstream iterator's return().
        if (++count >= n) return;
      }
    });
  }

  first() {
    for (const value of this) return value; // the early return closes the iterator
    return undefined;
  }

  toArray() {
    return [...this];
  }
}
