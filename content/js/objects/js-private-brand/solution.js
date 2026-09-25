const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

export class ApiCredential {
  #id;
  #secret;
  #scopes;

  constructor({ id, secret, scopes = [] }) {
    if (typeof secret !== 'string' || secret === '') {
      throw new TypeError('ApiCredential: secret must be a non-empty string');
    }
    this.#id = id;
    this.#secret = secret;
    this.#scopes = [...scopes];
  }

  get id() {
    return this.#id;
  }

  // A copy: callers cannot grant themselves scopes by mutating it.
  get scopes() {
    return [...this.#scopes];
  }

  can(scope) {
    return this.#scopes.includes(scope);
  }

  authorize(headers = {}) {
    return { ...headers, authorization: `Bearer ${this.#secret}` };
  }

  toJSON() {
    return { id: this.#id, scopes: this.scopes, secret: '[redacted]' };
  }

  toString() {
    return `ApiCredential(${this.#id})`;
  }

  [inspectCustom]() {
    return `ApiCredential { id: '${this.#id}', secret: [redacted] }`;
  }

  static isCredential(value) {
    // `#secret in value` throws for primitives, so check for an object first.
    return (typeof value === 'object' && value !== null) && #secret in value;
  }
}
