You built an `Emitter` in the JavaScript track. Now make it impossible to
misuse: wrong event name, wrong payload, wrong handler arity — all compile
errors.

## Task

Export:

```ts
type Events = {
  connected: [];
  message: [text: string, from: string];
  error: [error: Error];
};
declare const bus: TypedEmitter<Events>;

bus.emit('message', 'hi', 'ada');   // ok
bus.emit('message', 'hi');          // error: missing argument
bus.emit('connected');              // ok
bus.on('error', (e) => e.message);  // e is inferred as Error
```

Export a generic `interface TypedEmitter<E extends EventMap>` with:

- `on<K extends keyof E>(event: K, handler: (...args: E[K]) => void): () => void`
- `once` — same signature
- `off` — same
- `emit<K extends keyof E>(event: K, ...args: E[K]): number`
- `listenerCount(event: keyof E): number`
- `eventNames(): (keyof E)[]`

Also export:

- `EventMap` — the constraint: an object whose values are argument tuples
- `HandlerOf<E, K>` — the handler type for one event
- `PayloadOf<E, K>` — the argument tuple for one event
- `EventsWithoutPayload<E>` — the union of event names whose tuple is empty
  (the ones you can emit with no arguments)

The variadic `...args: E[K]` is the crux: it makes arity and each argument's
type follow from the event name.