import { send } from './solution';
import type { ConnState, ConnEvent, Status, EventType, Transitions, StateOf, EventFor, NextStatus } from './solution';

// --- the building blocks
type _status = Expect<Equal<Status, 'disconnected' | 'connecting' | 'connected' | 'failed'>>;
type _etype = Expect<Equal<EventType, 'CONNECT' | 'OPENED' | 'ERROR' | 'RETRY' | 'DISCONNECT'>>;
type _table = Expect<Equal<keyof Transitions, Status>>;
type _stateOf = Expect<Equal<StateOf<'connected'>, { status: 'connected'; sessionId: string }>>;
type _stateOf2 = Expect<Equal<StateOf<'failed' | 'disconnected'>, { status: 'failed'; error: string; attempt: number } | { status: 'disconnected' }>>;

// --- which events are legal where
type _ev1 = Expect<Equal<EventFor<'disconnected'>, { type: 'CONNECT' }>>;
type _ev2 = Expect<Equal<EventFor<'connecting'>, { type: 'OPENED'; sessionId: string } | { type: 'ERROR'; error: string } | { type: 'DISCONNECT' }>>;
type _ev3 = Expect<Equal<EventFor<'failed'>, { type: 'RETRY' } | { type: 'DISCONNECT' }>>;
// un-narrowed: only what is legal in *every* status
type _ev4 = Expect<Equal<EventFor<'connected' | 'failed'>, { type: 'DISCONNECT' }>>;
type _ev5 = Expect<Equal<EventFor<Status>, never>>;

// --- where they lead
type _n1 = Expect<Equal<NextStatus<'failed', 'RETRY'>, 'connecting'>>;
type _n2 = Expect<Equal<NextStatus<'connecting', 'ERROR'>, 'failed'>>;
type _n3 = Expect<Equal<NextStatus<'connected', 'OPENED'>, never>>;

// --- send: the event must be legal for the state you hold, and the result is precise
declare const idle: { status: 'disconnected' };
declare const dialing: StateOf<'connecting'>;
declare const up: StateOf<'connected'>;
declare const down: StateOf<'failed'>;
declare const anything: ConnState;

const a = send(idle, { type: 'CONNECT' });
type _a = Expect<Equal<typeof a, StateOf<'connecting'>>>;
const b = send(dialing, { type: 'OPENED', sessionId: 's-1' });
type _b = Expect<Equal<typeof b, StateOf<'connected'>>>;
const c = send(down, { type: 'RETRY' });
type _c = Expect<Equal<typeof c, StateOf<'connecting'>>>;
const d = send(up, { type: 'ERROR', error: 'reset' });
type _d = Expect<Equal<typeof d, StateOf<'failed'>>>;
const attempt: number = send(down, { type: 'RETRY' }).attempt;
const session: string = send(dialing, { type: 'OPENED', sessionId: 'x' }).sessionId;

// @ts-expect-error cannot open a connection that was never dialled
send(idle, { type: 'OPENED', sessionId: 's-1' });
// @ts-expect-error already connected
send(up, { type: 'CONNECT' });
// @ts-expect-error RETRY only makes sense after a failure
send(dialing, { type: 'RETRY' });
// @ts-expect-error OPENED needs a sessionId
send(dialing, { type: 'OPENED' });
// @ts-expect-error not an event at all
send(up, { type: 'EXPLODE' });
// @ts-expect-error an un-narrowed state accepts nothing: narrow first
send(anything, { type: 'DISCONNECT' });

// --- narrowing is how you get there
function hangUp(state: ConnState): ConnState {
  if (state.status === 'connected' || state.status === 'failed' || state.status === 'connecting') {
    const next = send(state, { type: 'DISCONNECT' });
    type _next = Expect<Equal<typeof next, StateOf<'disconnected'>>>;
    return next;
  }
  return state;
}

// --- the types are not a lie: the runtime agrees with them
const r1 = send({ status: 'failed', error: 'x', attempt: 2 }, { type: 'RETRY' });
const r2: StateOf<'failed'> = send({ status: 'connecting', attempt: 3 }, { type: 'ERROR', error: 'timeout' });
const _unused: unknown[] = [a, b, c, d, attempt, session, hangUp, r1, r2];
const _ev: ConnEvent = { type: 'CONNECT' };
