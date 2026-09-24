export type MyPartial<T> = { [K in keyof T]?: T[K] };

export type MyRequired<T> = { [K in keyof T]-?: T[K] };

export type MyReadonly<T> = { readonly [K in keyof T]: T[K] };

export type MyPick<T, K extends keyof T> = { [P in K]: T[P] };

// Key remapping with `as` drops the excluded keys without needing Exclude.
export type MyOmit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] };

export type MyRecord<K extends keyof any, V> = { [P in K]: V };

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer E)[] ? ReadonlyArray<DeepReadonly<E>>
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
