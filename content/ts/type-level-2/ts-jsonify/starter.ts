// The shape of any JSON value. TODO: make this precise (it is recursive).
export type Json = unknown;

// TODO: what T looks like after JSON.stringify + JSON.parse.
export type Jsonify<T> = T;

/** What the other side of the wire actually receives. */
export function roundTrip<T>(value: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(value));
}
