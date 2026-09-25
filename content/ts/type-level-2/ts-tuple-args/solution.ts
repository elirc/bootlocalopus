export type DropFirst<T extends readonly unknown[]> =
  T extends readonly [unknown, ...infer Rest] ? Rest : [];

/**
 * Fix the first arguments now, pass the rest later. Two variadic type
 * parameters let the compiler split `fn`'s parameter list at the point where
 * `head` ends.
 */
export function partial<Head extends unknown[], Tail extends unknown[], R>(
  fn: (...args: [...Head, ...Tail]) => R,
  ...head: Head
): (...tail: Tail) => R {
  return (...tail) => fn(...head, ...tail);
}

export type Bound<H> = {
  [K in keyof H]: H[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never;
};

/** Every handler takes the context first; the bound versions do not. */
export function bindAll<C, H extends Record<string, (ctx: C, ...args: never[]) => unknown>>(
  ctx: C,
  handlers: H,
): Bound<H> {
  const out: Record<string, (...args: never[]) => unknown> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    out[name] = (...args: never[]) => handler(ctx, ...args);
  }
  // The loop builds exactly Bound<H>, but the checker cannot follow it.
  return out as Bound<H>;
}
