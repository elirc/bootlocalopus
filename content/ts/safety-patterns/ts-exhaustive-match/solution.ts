export interface Tagged {
  kind: string;
}

/** One handler per variant, each receiving exactly that variant. */
export type Handlers<T extends Tagged, R> = {
  [K in T['kind']]: (value: Extract<T, { kind: K }>) => R;
};

/**
 * The handlers object is its own type parameter, so the result is the union of
 * what the handlers actually return. (A separate `R` would be inferred before
 * the handlers are checked, and come out as `unknown`.)
 *
 * Exhaustive: a missing handler is a compile error, and so is a handler for a
 * kind that does not exist. Adding a variant to T breaks every `match` that
 * does not handle it.
 */
export function match<T extends Tagged, H extends Handlers<T, unknown>>(
  value: T,
  // A constraint does not reject extra properties the way an annotation does,
  // so map any key that is not a kind to `never`.
  handlers: H & Record<Exclude<keyof H, T['kind']>, never>,
): ReturnType<H[keyof H]> {
  // Indexing by `value.kind` gives a union of handlers; TypeScript cannot see
  // that the one we pick is the one that fits `value`.
  const handler = handlers[value.kind as keyof H] as (value: T) => ReturnType<H[keyof H]>;
  return handler(value);
}

/**
 * Some handlers, plus a fallback that receives only the variants NOT handled —
 * so the fallback cannot accidentally depend on a handled variant's fields.
 */
export function matchOr<T extends Tagged, K extends T['kind'], R>(
  value: T,
  handlers: { [P in K]: (value: Extract<T, { kind: P }>) => R },
  otherwise: (value: Exclude<T, { kind: K }>) => R,
): R {
  if (Object.hasOwn(handlers, value.kind)) {
    const handler = handlers[value.kind as K] as (value: T) => R;
    return handler(value);
  }
  return otherwise(value as Exclude<T, { kind: K }>);
}

/** A reusable guard: `shapes.filter(isKind('circle'))` is `Circle[]`. */
export function isKind<K extends string>(kind: K) {
  return <T extends Tagged>(value: T): value is Extract<T, { kind: K }> => value.kind === kind;
}
