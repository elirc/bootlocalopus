import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'ts-boundaries',
  title: 'Types at the Boundary',
  summary: 'Where types meet untrusted data: validation, results, and a fully typed client.',
  lessons: [
    {
      id: 'ts-runtime-validator',
      title: 'A validator that narrows',
      kind: 'ts',
      xp: 95,
      why: 'Types vanish at runtime. Every API response is a lie until something checks it.',
      tags: ['validation', 'type guards', 'boundaries'],
      hints: [
        'The `leaf` factory needs to compare `typeof value` with the expected name and throw otherwise. Build the message as `expected ${typeName} at ${path || "value"}, got ${typeof value}`.',
        'Track the path by appending as you descend: for arrays `path ? path + "." + index : String(index)`, for objects `path ? path + "." + key : key`.',
        '`optional` returns the value untouched when it is `undefined`, otherwise delegates to the inner schema with the same path.',
        'For `object`, check `typeof value === "object" && value !== null && !Array.isArray(value)` first, then loop the shape keys in order, then compare `Object.keys(value)` against the shape keys to find extras — with `Object.hasOwn(shape, k)`, never `k in shape`.',
      ],
    },
    {
      id: 'ts-result',
      title: 'Result instead of throw',
      kind: 'ts',
      xp: 85,
      why: 'Makes failure part of the signature, so callers cannot forget it. The pattern behind Rust, Go, and every serious error-handling RFC.',
      tags: ['errors', 'unions', 'functional'],
      hints: [
        '`attempt` is a try/catch returning `ok(fn())` or `err(caught)`.',
        '`map` should check `result.ok` and return `ok(fn(result.value))`, otherwise return the original result object unchanged.',
        '`all` can use a plain loop: on the first `!r.ok`, return that result immediately; otherwise collect values and return `ok(values)`.',
        '`unwrap` throws `result.error` directly — do not wrap it in a new Error, or you lose the type the caller wanted to branch on.',
      ],
    },
    {
      id: 'ts-typed-client',
      title: 'A typed API surface',
      kind: 'typecheck',
      xp: 90,
      why: 'One route map, and every call site knows its params and response. This is what "typed end to end" actually means.',
      tags: ['generics', 'template literals', 'api design'],
      hints: [
        '`export type Endpoint = keyof Routes;` then `ResponseOf<E extends Endpoint> = Routes[E]["response"]`.',
        'To filter by method, use the "map to key or never, then index" trick: `{ [K in Endpoint]: Routes[K]["method"] extends "GET" ? K : never }[Endpoint]`.',
        'For `BodyOf`, check whether the route type has a `body` key: `Routes[E] extends { body: infer B } ? B : never`.',
        'The client methods need their own type parameters so the return type depends on the argument: `get<E extends GetEndpoint>(endpoint: E): Promise<ResponseOf<E>>`.',
      ],
    },
    {
      id: 'ts-typed-emitter',
      title: 'BOSS: a fully typed EventEmitter',
      kind: 'typecheck',
      xp: 210,
      boss: true,
      why: 'This is the type-level exercise that separates "I use TypeScript" from "I can design an API in TypeScript".',
      tags: ['generics', 'variadic tuples', 'api design'],
      hints: [
        '`PayloadOf` is just `E[K]`, and `HandlerOf` is `(...args: E[K]) => void`. The power comes from spreading a tuple type into a parameter list.',
        'For `emit`, the signature is `emit<K extends keyof E>(event: K, ...args: E[K]): number`. Because `E[K]` is a tuple, the compiler checks both arity and each position.',
        'Tuples can carry labels (`[text: string, from: string]`), which show up in editor hints — worth doing in the Events map, but not required for the types to work.',
        'For `EventsWithoutPayload`, map to the key when the tuple is assignable to `[]`: `{ [K in keyof E]: E[K] extends [] ? K : never }[keyof E]`.',
        'Return `() => void` from `on` and `once` so callers get an unsubscribe function, matching the JavaScript version you already built.',
      ],
    },
  ],
});
