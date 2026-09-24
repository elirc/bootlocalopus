export type EventMap = Record<string, unknown[]>;

export type PayloadOf<E extends EventMap, K extends keyof E> = unknown;   // TODO
export type HandlerOf<E extends EventMap, K extends keyof E> = unknown;   // TODO
export type EventsWithoutPayload<E extends EventMap> = keyof E;           // TODO

export interface TypedEmitter<E extends EventMap> {
  // TODO
}
