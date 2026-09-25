export type AnyResponse = { status: number };

// TODO: the member of R with status S.
export type ResponseFor<R extends AnyResponse, S extends number> = R;

// TODO: one handler per status of R, each receiving its own response.
export type Handlers<R extends AnyResponse, Out> = Record<number, (res: R) => Out>;

export function match<R extends AnyResponse>(res: R, handlers: Record<number, (res: any) => any>): any {
  return handlers[res.status](res);
}

export function matchOr<R extends AnyResponse>(
  res: R,
  handlers: Record<number, (res: any) => any>,
  fallback: (res: R) => any,
): any {
  const handler = handlers[res.status];
  return handler ? handler(res) : fallback(res);
}

export function isStatus(res: AnyResponse, ...statuses: number[]): boolean {
  return statuses.includes(res.status);
}
