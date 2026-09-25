export function enumOf<const T extends readonly string[]>(values: T) {
  const allowed: ReadonlySet<string> = new Set(values);
  const is = (value: unknown): value is T[number] =>
    typeof value === 'string' && allowed.has(value);
  return {
    values,
    is,
    parse(value: unknown): T[number] {
      if (is(value)) return value;
      throw new RangeError(`expected one of ${values.join(', ')}, got ${String(value)}`);
    },
  };
}

/** `{ post: ['read'] }` → `'post:read'`. Distributes over resources, then over actions. */
export type PermissionOf<R extends Record<string, readonly string[]>> = {
  [K in keyof R & string]: `${K}:${R[K][number]}`;
}[keyof R & string];

export function definePermissions<const R extends Record<string, readonly string[]>>(resources: R) {
  type Permission = PermissionOf<R>;
  const all: Permission[] = [];
  for (const resource of Object.keys(resources)) {
    for (const action of resources[resource]) {
      // Built from R's own keys and values, so it is a Permission by construction.
      all.push(`${resource}:${action}` as Permission);
    }
  }
  return {
    all,
    can(granted: readonly Permission[], needed: Permission): boolean {
      return granted.includes(needed);
    },
  };
}
