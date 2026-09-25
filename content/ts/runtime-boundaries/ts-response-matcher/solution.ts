export type AnyResponse = { status: number };

/** The member of R with this status (or statuses). */
export type ResponseFor<R extends AnyResponse, S extends R['status']> = Extract<R, { status: S }>;

/** One handler per status, each receiving exactly its own response type. */
export type Handlers<R extends AnyResponse, Out> = {
  [S in R['status']]: (res: ResponseFor<R, S>) => Out;
};

/**
 * Exhaustive: a missing status does not compile. The handlers object gets its
 * own type parameter H: its constraint gives each handler its parameter type,
 * and the result is the union of what the handlers return.
 */
export function match<R extends AnyResponse, H extends Handlers<R, unknown>>(
  res: R,
  handlers: H,
): ReturnType<H[keyof H]> {
  const handler = handlers[res.status as keyof H] as (res: R) => ReturnType<H[keyof H]>;
  return handler(res);
}

/**
 * Some handlers, plus a fallback that receives only the statuses they did not
 * cover. H is its own type parameter so `keyof H` knows which ones those are.
 */
export function matchOr<R extends AnyResponse, H extends Partial<Handlers<R, Out>>, Out>(
  res: R,
  handlers: H,
  fallback: (res: Exclude<R, { status: keyof H }>) => Out,
): Out {
  const handler = handlers[res.status as keyof H] as ((res: R) => Out) | undefined;
  return handler ? handler(res) : fallback(res as Exclude<R, { status: keyof H }>);
}

export function isStatus<R extends AnyResponse, S extends R['status']>(
  res: R,
  ...statuses: S[]
): res is ResponseFor<R, S> {
  return (statuses as number[]).includes(res.status);
}
