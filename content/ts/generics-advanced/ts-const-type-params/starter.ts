// Both helpers lose their literals: callers get `string` where they wanted a
// union of the values they passed in.

export function enumOf<T extends string>(values: T[]) {
  const allowed: ReadonlySet<string> = new Set(values);
  const is = (value: unknown): value is T =>
    typeof value === 'string' && allowed.has(value);
  return {
    values,
    is,
    parse(value: unknown): T {
      if (is(value)) return value;
      throw new RangeError(`expected one of ${values.join(', ')}, got ${String(value)}`);
    },
  };
}

// TODO: compute the union of `${resource}:${action}` strings.
export type PermissionOf<R extends Record<string, readonly string[]>> = string;

export function definePermissions<R extends Record<string, string[]>>(resources: R) {
  const all: string[] = [];
  for (const resource of Object.keys(resources)) {
    for (const action of resources[resource]) all.push(`${resource}:${action}`);
  }
  return {
    all,
    can(granted: readonly string[], needed: string): boolean {
      return granted.includes(needed);
    },
  };
}
