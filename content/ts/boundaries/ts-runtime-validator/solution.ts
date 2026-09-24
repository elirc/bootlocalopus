export class ValidationError extends Error {
  constructor(message, path) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
  }
}

const where = (path) => path || 'value';
const fail = (expected, got, path) => {
  throw new ValidationError('expected ' + expected + ' at ' + where(path) + ', got ' + got, path);
};
const describeValue = (value) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

const leaf = (typeName) => ({
  parse(value, path = '') {
    if (typeof value !== typeName) fail(typeName, describeValue(value), path);
    return value;
  },
});

export const string = () => leaf('string');
export const number = () => leaf('number');
export const boolean = () => leaf('boolean');

export const optional = (schema) => ({
  parse(value, path = '') {
    return value === undefined ? undefined : schema.parse(value, path);
  },
});

export const arrayOf = (schema) => ({
  parse(value, path = '') {
    if (!Array.isArray(value)) fail('array', describeValue(value), path);
    return value.map((item, i) => schema.parse(item, path ? path + '.' + i : String(i)));
  },
});

export const object = (shape) => ({
  parse(value, path = '') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail('object', describeValue(value), path);
    }
    // Own properties only. `key in obj` walks the prototype, so it would treat
    // "constructor", "toString" or "__proto__" as declared on every shape.
    const out = {};
    for (const [key, schema] of Object.entries(shape)) {
      const child = path ? path + '.' + key : key;
      const present = Object.hasOwn(value, key);
      const parsed = schema.parse(present ? value[key] : undefined, child);
      if (parsed !== undefined || present) out[key] = parsed;
    }
    const extra = Object.keys(value).find((k) => !Object.hasOwn(shape, k));
    if (extra !== undefined) {
      const child = path ? path + '.' + extra : extra;
      throw new ValidationError('unexpected key at ' + child, child);
    }
    return out;
  },
});
