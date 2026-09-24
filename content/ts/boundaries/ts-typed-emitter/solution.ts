export type EventMap = Record<string, unknown[]>;

export type PayloadOf<E extends EventMap, K extends keyof E> = E[K];

// Spreading the tuple into the parameter list is what fixes arity and types.
export type HandlerOf<E extends EventMap, K extends keyof E> = (...args: E[K]) => void;

export type EventsWithoutPayload<E extends EventMap> = {
  [K in keyof E]: E[K] extends [] ? K : never;
}[keyof E];

export interface TypedEmitter<E extends EventMap> {
  on<K extends keyof E>(event: K, handler: HandlerOf<E, K>): () => void;
  once<K extends keyof E>(event: K, handler: HandlerOf<E, K>): () => void;
  off<K extends keyof E>(event: K, handler: HandlerOf<E, K>): this;
  emit<K extends keyof E>(event: K, ...args: PayloadOf<E, K>): number;
  listenerCount(event: keyof E): number;
  eventNames(): (keyof E)[];
}
