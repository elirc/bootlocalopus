// TODO: the tuple T without its first element.
export type DropFirst<T extends readonly unknown[]> = T;

// TODO: type this so the returned function takes exactly the remaining parameters.
export function partial(fn: (...args: any[]) => any, ...head: any[]): (...tail: any[]) => any {
  return (...tail) => fn(...head, ...tail);
}

// TODO: each handler without its first (context) parameter.
export type Bound<H> = H;

export function bindAll<C, H extends Record<string, (ctx: C, ...args: never[]) => unknown>>(
  ctx: C,
  handlers: H,
): Bound<H> {
  const out: Record<string, (...args: never[]) => unknown> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    out[name] = (...args: never[]) => handler(ctx, ...args);
  }
  return out as Bound<H>;
}
