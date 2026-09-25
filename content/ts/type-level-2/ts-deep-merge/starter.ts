type Opaque = ((...args: never[]) => unknown) | Date;

export type DeepPartial<T> =
  T extends Opaque ? T
  : T extends readonly unknown[] ? T
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  // TODO
  return false;
}

export function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  // TODO: this is shallow, mutates `base`, and trusts every key.
  return Object.assign(base as object, override) as T;
}
