type Fn = (...args: never[]) => unknown;

// Values we stop at: they are leaves, never descended into.
type Leaf = Fn | Date | readonly unknown[];

export type Paths<T> = T extends Leaf
  ? never
  : T extends object
    ? {
        // `-?` so an optional key does not add `undefined` to the union we index.
        [K in keyof T & string]-?: NonNullable<T[K]> extends Fn
          ? never
          : K | `${K}.${Paths<NonNullable<T[K]>>}`;
      }[keyof T & string]
    : never;

export type PathValue<T, P extends string> =
  // Distributes over T: a missing parent contributes `undefined`, like `?.` does.
  T extends null | undefined
    ? undefined
    : P extends `${infer Head}.${infer Rest}`
      ? Head extends keyof T
        ? PathValue<T[Head], Rest>
        : never
      : P extends keyof T
        ? T[P]
        : never;

export function get<T, P extends Paths<T>>(obj: T, path: P): PathValue<T, P> {
  let current: unknown = obj;
  for (const key of path.split('.')) {
    if (current === null || current === undefined) return undefined as PathValue<T, P>;
    current = (current as Record<string, unknown>)[key];
  }
  return current as PathValue<T, P>;
}
