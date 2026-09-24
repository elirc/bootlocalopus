export type MyReturnType<F> = F extends (...args: never[]) => infer R ? R : never;

export type MyParameters<F> = F extends (...args: infer P) => unknown ? P : never;

// Going through the parameter tuple is what makes a zero-arg function never:
// matching (first: infer A, ...) directly would succeed and infer unknown.
export type FirstParam<F> = F extends (...args: infer P) => unknown
  ? (P extends [infer A, ...unknown[]] ? A : never)
  : never;

export type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

// Recursing is what handles Promise<Promise<T>>.
export type MyAwaited<T> = T extends Promise<infer V> ? MyAwaited<V> : T;

export type Last<T> = T extends readonly [...unknown[], infer L] ? L : never;
