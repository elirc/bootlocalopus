export class Model {
  static fields = [];

  constructor(attrs = {}) {
    if (new.target === Model) {
      throw new TypeError('Model is abstract: subclass it and declare static fields');
    }
    // new.target is the concrete class, even when called through super().
    for (const field of new.target.fields) {
      this[field] = attrs[field] ?? null;
    }
  }

  // In a static method `this` is the class it was called on.
  static fromJSON(text) {
    return new this(JSON.parse(text));
  }

  static many(rows) {
    return rows.map((row) => new this(row));
  }

  toJSON() {
    const out = {};
    for (const field of this.constructor.fields) out[field] = this[field];
    return out;
  }

  clone(changes = {}) {
    return new this.constructor({ ...this.toJSON(), ...changes });
  }

  equals(other) {
    if (other === null || typeof other !== 'object' || other.constructor !== this.constructor) return false;
    return this.constructor.fields.every((field) => Object.is(this[field], other[field]));
  }

  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
}
