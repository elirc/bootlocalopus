// `Readonly<T>` is shallow: `settings.theme = 'dark'` is an error, and
// `settings.tags.push('x')` and `settings.owners.set(…)` are not.

// TODO: make this deep, with the right read-only interface for each kind of value.
export type Immutable<T> = Readonly<T>;

export function deepFreeze<T>(value: T): Immutable<T> {
  // TODO: freeze nested objects and arrays too.
  return Object.freeze(value);
}

export interface Line {
  sku: string;
  qty: number;
}

export interface Cart {
  id: string;
  lines: Line[];
}

export function totalQty(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

export function addLine(cart: Cart, line: Line): Cart {
  cart.lines.push(line);
  return cart;
}
