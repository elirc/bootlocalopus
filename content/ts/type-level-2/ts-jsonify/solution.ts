export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Things JSON.stringify silently drops from objects (and turns into null inside arrays).
type Dropped = undefined | symbol | ((...args: never[]) => unknown);

type JsonifyElement<E> = E extends Dropped ? null : Jsonify<E>;

export type Jsonify<T> =
  // toJSON wins over everything else: that is how a Date becomes a string.
  T extends { toJSON(): infer R } ? Jsonify<R>
  : T extends string | number | boolean | null ? T
  : T extends Dropped | bigint ? never
  : T extends readonly (infer E)[] ? JsonifyElement<E>[]
  : T extends object
    ? { [K in keyof T as K extends symbol ? never : T[K] extends Dropped ? never : K]: Jsonify<T[K]> }
    : never;

/** What the other side of the wire actually receives. */
export function roundTrip<T>(value: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(value));
}
