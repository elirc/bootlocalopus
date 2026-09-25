// TODO: every dotted path into T, e.g. 'profile' | 'profile.address.city' | ...
export type Paths<T> = string;

// TODO: the type found at path P inside T.
export type PathValue<T, P extends string> = unknown;

// The runtime part already works; only the types above need fixing.
export function get<T, P extends Paths<T>>(obj: T, path: P): PathValue<T, P> {
  let current: unknown = obj;
  for (const key of path.split('.')) {
    if (current === null || current === undefined) return undefined as PathValue<T, P>;
    current = (current as Record<string, unknown>)[key];
  }
  return current as PathValue<T, P>;
}
