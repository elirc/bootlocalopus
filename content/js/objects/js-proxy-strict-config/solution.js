export class UnknownKeyError extends Error {
  constructor(name, key) {
    super(`${name}: unknown key "${key}"`);
    this.name = 'UnknownKeyError';
    this.key = key;
  }
}

// Keys that libraries and the runtime probe for; reading them must never throw.
const PROBED_KEYS = new Set(['then', 'toJSON']);

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));

export function strictConfig(values, { name = 'config' } = {}) {
  const readOnly = (action) => (_target, key) => {
    throw new TypeError(`${name}: cannot ${action} "${String(key)}", config is read-only`);
  };

  return new Proxy(values, {
    get(target, key, receiver) {
      if (typeof key === 'symbol' || PROBED_KEYS.has(key)) return Reflect.get(target, key, receiver);
      if (!(key in target)) throw new UnknownKeyError(name, key);
      const value = Reflect.get(target, key, receiver);
      return isPlainObject(value) ? strictConfig(value, { name: `${name}.${key}` }) : value;
    },
    set: readOnly('set'),
    deleteProperty: readOnly('delete'),
    defineProperty: readOnly('define'),
  });
}
