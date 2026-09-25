import { defineMachine } from './solution';
import type { StateOf, EventOf, EventsIn, FinalState } from './solution';

const fetcher = defineMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: { on: { RESOLVE: 'success', REJECT: 'failure', CANCEL: 'idle' } },
    failure: { on: { RETRY: 'loading', CANCEL: 'idle' } },
    success: { on: {} },
  },
});
type Fetcher = typeof fetcher;
type States = Fetcher['states'];

// --- the unions are derived from the config literal, no `as const` needed
type _states = Expect<Equal<StateOf<Fetcher>, 'idle' | 'loading' | 'failure' | 'success'>>;
type _events = Expect<Equal<EventOf<Fetcher>, 'FETCH' | 'RESOLVE' | 'REJECT' | 'CANCEL' | 'RETRY'>>;
type _inLoading = Expect<Equal<EventsIn<States, 'loading'>, 'RESOLVE' | 'REJECT' | 'CANCEL'>>;
type _inSuccess = Expect<Equal<EventsIn<States, 'success'>, never>>;
type _final = Expect<Equal<FinalState<States>, 'success'>>;
type _initial = Expect<Equal<Fetcher['initial'], 'idle' | 'loading' | 'failure' | 'success'>>;

// --- transitions are checked per state, and the result is the literal target
const afterFetch = fetcher.transition('idle', 'FETCH');
type _afterFetch = Expect<Equal<typeof afterFetch, 'loading'>>;
const afterReject = fetcher.transition('loading', 'REJECT');
type _afterReject = Expect<Equal<typeof afterReject, 'failure'>>;
// @ts-expect-error RESOLVE means nothing while idle
fetcher.transition('idle', 'RESOLVE');
// @ts-expect-error success is final
fetcher.transition('success', 'RETRY');
// @ts-expect-error not a state
fetcher.transition('done', 'FETCH');

// --- the config itself is validated
defineMachine({
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    // @ts-expect-error a typo in a target state
    on: { on: { TOGGLE: 'of' } },
  },
});
defineMachine({
  // @ts-expect-error a typo in the initial state
  initial: 'of',
  states: { off: { on: { TOGGLE: 'on' } }, on: { on: { TOGGLE: 'off' } } },
});
// @ts-expect-error every state needs an `on` map
defineMachine({ initial: 'a', states: { a: { next: 'b' }, b: { on: {} } } });

// --- runtime checks for events that arrive as data
declare const incoming: string;
const allowed: boolean = fetcher.can('loading', incoming);
// @ts-expect-error not a state
fetcher.can('paused', incoming);

declare const current: StateOf<Fetcher>;
if (fetcher.isFinal(current)) {
  type _narrowed = Expect<Equal<typeof current, 'success'>>;
}

// --- a running service
const service = fetcher.start();
type _serviceState = Expect<Equal<typeof service.state, 'idle' | 'loading' | 'failure' | 'success'>>;
const moved: boolean = service.send('FETCH');
// @ts-expect-error not an event of this machine
service.send('PAUSE');
// @ts-expect-error the state only changes through send
service.state = 'success';

// A second machine does not leak into the first.
const toggle = defineMachine({ initial: 'off', states: { off: { on: { FLIP: 'on' } }, on: { on: { FLIP: 'off' } } } });
type _toggle = Expect<Equal<EventOf<typeof toggle>, 'FLIP'>>;
// @ts-expect-error FETCH belongs to the other machine
toggle.start().send('FETCH');
