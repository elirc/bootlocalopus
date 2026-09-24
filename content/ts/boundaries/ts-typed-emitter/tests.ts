import type {
  TypedEmitter, EventMap, PayloadOf, HandlerOf, EventsWithoutPayload,
} from './solution';

type Events = {
  connected: [];
  message: [text: string, from: string];
  error: [error: Error];
  progress: [percent: number];
};

declare const bus: TypedEmitter<Events>;

type _payload = Expect<Equal<PayloadOf<Events, 'message'>, [text: string, from: string]>>;
type _handler = Expect<Equal<HandlerOf<Events, 'error'>, (error: Error) => void>>;
type _empty = Expect<Equal<EventsWithoutPayload<Events>, 'connected'>>;
type _mapOk = Expect<Equal<Events extends EventMap ? true : false, true>>;

// --- emit: arity and argument types both follow from the event name
const n: number = bus.emit('message', 'hi', 'ada');
bus.emit('connected');
bus.emit('error', new Error('boom'));
bus.emit('progress', 50);

// @ts-expect-error missing the second argument
bus.emit('message', 'hi');
// @ts-expect-error too many arguments
bus.emit('connected', 'extra');
// @ts-expect-error wrong argument type
bus.emit('progress', '50');
// @ts-expect-error wrong payload type
bus.emit('error', 'boom');
// @ts-expect-error unknown event
bus.emit('exploded');

// --- on: the handler's parameters are inferred, no annotations needed
const stop = bus.on('message', (text, from) => {
  const a: string = text;
  const b: string = from;
});
type _stop = Expect<Equal<typeof stop, () => void>>;

bus.on('error', (error) => {
  const msg: string = error.message;
});
bus.on('connected', () => {});
// A handler may ignore trailing arguments, exactly like a normal callback.
bus.on('message', (text) => text.toUpperCase());

// @ts-expect-error the payload is a string, not a number
bus.on('message', (text: number) => {});
// @ts-expect-error handler declares more parameters than the event provides
bus.on('progress', (percent: number, extra: string) => {});
// @ts-expect-error unknown event
bus.on('exploded', () => {});

// --- once and off mirror on
const stopOnce: () => void = bus.once('connected', () => {});
const handler = (error: Error) => {};
bus.off('error', handler);
// @ts-expect-error handler does not match the event's payload
bus.off('error', (n: number) => {});

// --- the odds and ends
const count: number = bus.listenerCount('message');
// @ts-expect-error not an event of this emitter
bus.listenerCount('nope');
const names = bus.eventNames();
type _names = Expect<Equal<typeof names, (keyof Events)[]>>;

// --- it is generic over any event map, not hardcoded to Events
type Other = { ping: [] };
declare const other: TypedEmitter<Other>;
other.emit('ping');
// @ts-expect-error not an event of this emitter
other.emit('message', 'a', 'b');
