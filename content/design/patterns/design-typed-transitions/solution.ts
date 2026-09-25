export type ConnState =
  | { status: 'disconnected' }
  | { status: 'connecting'; attempt: number }
  | { status: 'connected'; sessionId: string }
  | { status: 'failed'; error: string; attempt: number };

export type ConnEvent =
  | { type: 'CONNECT' }
  | { type: 'OPENED'; sessionId: string }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'DISCONNECT' };

export type Status = ConnState['status'];
export type EventType = ConnEvent['type'];

/** The transition table, as a type: status -> event type -> next status. */
export type Transitions = {
  disconnected: { CONNECT: 'connecting' };
  connecting: { OPENED: 'connected'; ERROR: 'failed'; DISCONNECT: 'disconnected' };
  connected: { ERROR: 'failed'; DISCONNECT: 'disconnected' };
  failed: { RETRY: 'connecting'; DISCONNECT: 'disconnected' };
};

export type StateOf<S extends Status> = Extract<ConnState, { status: S }>;

// `keyof` of a union is the keys common to every member, so for an
// un-narrowed status this is only the events legal in *every* state.
export type EventFor<S extends Status> = Extract<ConnEvent, { type: keyof Transitions[S] }>;

export type NextStatus<S extends Status, T extends EventType> =
  T extends keyof Transitions[S] ? Extract<Transitions[S][T], Status> : never;

export function send<S extends ConnState, E extends EventFor<S['status']>>(
  state: S,
  event: E,
): StateOf<NextStatus<S['status'], E['type']>> {
  const s: ConnState = state;
  const e: ConnEvent = event;
  let next: ConnState;
  switch (e.type) {
    case 'CONNECT': next = { status: 'connecting', attempt: 1 }; break;
    case 'OPENED': next = { status: 'connected', sessionId: e.sessionId }; break;
    case 'ERROR': next = { status: 'failed', error: e.error, attempt: s.status === 'connecting' ? s.attempt : 0 }; break;
    case 'RETRY': next = { status: 'connecting', attempt: s.status === 'failed' ? s.attempt + 1 : 1 }; break;
    case 'DISCONNECT': next = { status: 'disconnected' }; break;
  }
  // The table above is the proof that `next` has this status; the compiler
  // cannot follow a runtime switch into a type-level lookup, so we tell it.
  return next as StateOf<NextStatus<S['status'], E['type']>>;
}
