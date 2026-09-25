// Things that must pass through untouched: mapping over a function or a Date
// produces an object of their methods, which is useless and not callable.
type Opaque = ((...args: never[]) => unknown) | Date;

export type DeepPartial<T> =
  T extends Opaque ? T
  // Overrides REPLACE arrays rather than merge them, so an array stays whole.
  : T extends readonly unknown[] ? T
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type DeepReadonly<T> =
  T extends Opaque ? T
  // A homomorphic mapped type over an array (or tuple) gives a readonly array.
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type DeepRequired<T> =
  T extends Opaque ? T
  : T extends readonly unknown[] ? T
  : T extends object ? { [K in keyof T]-?: DeepRequired<T[K]> }
  : T;
