export class UnknownKeyError extends Error {
  // TODO: name 'UnknownKeyError', a `key` property
}

export function strictConfig(values, { name = 'config' } = {}) {
  // TODO: return a Proxy that throws on unknown string keys,
  // but not on symbols, `then` or `toJSON`
  throw new Error('strictConfig: not implemented');
}
