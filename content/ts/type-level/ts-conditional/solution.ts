type AnyFn = (...args: never[]) => unknown;

export type FunctionKeys<T> = {
  [K in keyof T]-?: T[K] extends AnyFn ? K : never;
}[keyof T];

export type DataKeys<T> = {
  [K in keyof T]-?: T[K] extends AnyFn ? never : K;
}[keyof T];

export type Methods<T> = Pick<T, FunctionKeys<T>>;

export type NonNullableProps<T> = { [K in keyof T]-?: NonNullable<T[K]> };

// Only unwrap when the element is itself an array, so number[] stays number[].
// The [E] extends [...] brackets stop the conditional distributing over unions:
// a naked E would split boolean into true | false and hand back a mess.
export type Flatten<T> = T extends readonly (infer E)[]
  ? ([E] extends [readonly unknown[]] ? E : T)
  : T;

export type Unionise<T> = { [K in keyof T]: { key: K; value: T[K] } }[keyof T];
