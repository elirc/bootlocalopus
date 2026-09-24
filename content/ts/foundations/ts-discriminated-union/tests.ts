import { render, assertNever } from './solution';
import type { RequestState } from './solution';

// All four states are constructible.
const idle: RequestState<string> = { status: 'idle' };
const loading: RequestState<string> = { status: 'loading' };
const ok: RequestState<{ id: number }> = { status: 'success', data: { id: 1 } };
const bad: RequestState<string> = { status: 'error', error: new Error('boom') };

const out: string = render(ok);

// Narrowing works: data is only available on the success member.
declare const state: RequestState<number>;
if (state.status === 'success') {
  const n: number = state.data;
  type _d = Expect<Equal<typeof state.data, number>>;
}
if (state.status === 'error') {
  const msg: string = state.error.message;
}

// The union must have exactly these four discriminants.
type Statuses = RequestState<unknown>['status'];
type _statuses = Expect<Equal<Statuses, 'idle' | 'loading' | 'success' | 'error'>>;

// Impossible states must be rejected.
// @ts-expect-error idle carries no data
const wrong1: RequestState<string> = { status: 'idle', data: 'nope' };
// @ts-expect-error success requires data
const wrong2: RequestState<string> = { status: 'success' };
// @ts-expect-error there is no such status
const wrong3: RequestState<string> = { status: 'pending' };
// @ts-expect-error error state carries an Error, not a string
const wrong4: RequestState<string> = { status: 'error', error: 'boom' };

// assertNever only accepts never.
declare const nothing: never;
const n2: never = assertNever(nothing);
// @ts-expect-error a real value is not assignable to never
assertNever('surprise');
