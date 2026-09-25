export class Model {
  static fields = [];

  constructor(attrs = {}) {
    // TODO: refuse `new Model()`, then copy the concrete class's fields
    throw new Error('Model: not implemented');
  }

  static fromJSON(text) {
    return new Model(JSON.parse(text)); // BUG: always builds a Model
  }

  // TODO: many, toJSON, clone, equals, [Symbol.toStringTag]
}
