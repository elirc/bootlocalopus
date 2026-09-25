export class ApiCredential {
  constructor({ id, secret, scopes = [] }) {
    // TODO: validate, and keep the secret somewhere nothing can see it
    throw new Error('ApiCredential: not implemented');
  }

  // TODO: id, scopes, can, authorize, toJSON, toString,
  // [Symbol.for('nodejs.util.inspect.custom')]

  static isCredential(value) {
    // TODO: a brand check, not instanceof
    return false;
  }
}
