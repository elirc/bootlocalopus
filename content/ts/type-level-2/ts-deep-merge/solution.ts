type Opaque = ((...args: never[]) => unknown) | Date;

export type DeepPartial<T> =
  T extends Opaque ? T
  : T extends readonly unknown[] ? T
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

type PlainObject = Record<string, unknown>;

// Keys that would reach Object.prototype (or a constructor) if we assigned them.
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A copy that shares no plain object or array with the original. */
function cloneDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneDeep);
  if (!isPlainObject(value)) return value; // primitives, Dates, class instances: values
  const out: PlainObject = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key)) continue;
    out[key] = cloneDeep(value[key]);
  }
  return out;
}

function mergeValue(base: unknown, override: unknown): unknown {
  if (override === undefined) return cloneDeep(base);
  if (isPlainObject(base) && isPlainObject(override)) {
    const out = cloneDeep(base) as PlainObject;
    for (const key of Object.keys(override)) {
      if (FORBIDDEN.has(key)) continue;
      out[key] = mergeValue(base[key], override[key]);
    }
    return out;
  }
  // Arrays, null, primitives, Dates and class instances replace whatever was there.
  return cloneDeep(override);
}

export function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  return mergeValue(base, override) as T;
}
