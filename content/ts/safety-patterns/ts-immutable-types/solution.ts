/**
 * Deeply read-only. Order matters: functions and Dates are left alone, the
 * collections get their read-only interfaces, and arrays/tuples go through a
 * homomorphic mapped type so a tuple stays a tuple.
 */
export type Immutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Date
    ? T
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<Immutable<K>, Immutable<V>>
      : T extends ReadonlySet<infer U>
        ? ReadonlySet<Immutable<U>>
        : T extends readonly unknown[]
          ? { readonly [I in keyof T]: Immutable<T[I]> }
          : T extends object
            ? { readonly [K in keyof T]: Immutable<T[K]> }
            : T;

/** Freezes plain objects and arrays all the way down, and types the result to match. */
export function deepFreeze<T>(value: T): Immutable<T> {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  // Freezing changes nothing about the value's shape, only what the type allows.
  return value as Immutable<T>;
}

export interface Line {
  sku: string;
  qty: number;
}

export interface Cart {
  id: string;
  lines: Line[];
}

/** Read-only inputs accept frozen and ordinary values alike. */
export function totalQty(lines: readonly Immutable<Line>[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

/** Returns a new cart; the input is never touched. */
export function addLine(cart: Immutable<Cart>, line: Line): Immutable<Cart> {
  return { ...cart, lines: [...cart.lines, line] };
}
