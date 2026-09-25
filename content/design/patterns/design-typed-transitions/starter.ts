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

export type Status = string;     // TODO: derive from ConnState
export type EventType = string;  // TODO: derive from ConnEvent

// TODO: status -> event type -> next status
export type Transitions = {};

export type StateOf<S extends Status> = ConnState;          // TODO
export type EventFor<S extends Status> = ConnEvent;         // TODO
export type NextStatus<S extends Status, T extends EventType> = Status; // TODO

// The runtime body is correct. Give `send` a signature that only accepts
// events legal for the state you pass, and returns the precise next state.
export function send(state: ConnState, event: ConnEvent): ConnState {
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
  return next;
}
