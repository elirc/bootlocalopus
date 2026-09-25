// Works at runtime; checks nothing. A handler can be missing (the call then
// crashes with "handler is not a function"), every value is `any`, and the
// result is `unknown`.

export interface Tagged {
  kind: string;
}

// TODO: one handler per variant of T, each receiving exactly that variant.
export type Handlers<T extends Tagged, R> = Record<string, (value: any) => R>;

export function match(value: Tagged, handlers: Record<string, (value: any) => unknown>): unknown {
  return handlers[value.kind](value);
}

export function matchOr(
  value: Tagged,
  handlers: Record<string, (value: any) => unknown>,
  otherwise: (value: any) => unknown,
): unknown {
  if (Object.hasOwn(handlers, value.kind)) return handlers[value.kind](value);
  return otherwise(value);
}

export function isKind(kind: string) {
  return (value: Tagged): boolean => value.kind === kind;
}
