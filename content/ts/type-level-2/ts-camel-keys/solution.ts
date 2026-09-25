export type CamelCase<S extends string> =
  S extends `${infer Head}_${infer Tail}` ? `${Head}${CamelCase<Capitalize<Tail>>}` : S;

export type SnakeCase<S extends string> =
  S extends `${infer C}${infer Rest}`
    // An uppercase letter is one that changes when lowercased (digits do not).
    ? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${SnakeCase<Rest>}`
    : S;

type Opaque = Date | ((...args: never[]) => unknown);

export type CamelKeys<T> =
  T extends Opaque ? T
  : T extends (infer E)[] ? CamelKeys<E>[]
  : T extends readonly (infer E)[] ? readonly CamelKeys<E>[]
  : T extends object ? { [K in keyof T as K extends string ? CamelCase<K> : K]: CamelKeys<T[K]> }
  : T;

export type SnakeKeys<T> =
  T extends Opaque ? T
  : T extends (infer E)[] ? SnakeKeys<E>[]
  : T extends readonly (infer E)[] ? readonly SnakeKeys<E>[]
  : T extends object ? { [K in keyof T as K extends string ? SnakeCase<K> : K]: SnakeKeys<T[K]> }
  : T;
