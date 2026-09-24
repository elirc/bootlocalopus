export class ValidationError extends Error {
  constructor(message, path) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
  }
}

const leaf = (typeName) => ({
  parse(value, path = '') {
    // TODO
  },
});

export const string = () => leaf('string');
export const number = () => leaf('number');
export const boolean = () => leaf('boolean');

export const optional = (schema) => ({ parse(value, path = '') {} });
export const arrayOf = (schema) => ({ parse(value, path = '') {} });
export const object = (shape) => ({ parse(value, path = '') {} });
