import { createMachine, withDefault, retry } from './solution';
import type { Machine } from './solution';

// --- createMachine: the states array decides S
const machine = createMachine({ states: ['idle', 'loading', 'done'], initial: 'idle' });
type _machine = Expect<Equal<typeof machine, Machine<'idle' | 'loading' | 'done'>>>;
type _current = Expect<Equal<typeof machine.current, 'idle' | 'loading' | 'done'>>;
machine.go('loading');
// @ts-expect-error not one of the states
machine.go('finished');
// @ts-expect-error a typo in initial must not widen S
createMachine({ states: ['idle', 'loading'], initial: 'idel' });
// @ts-expect-error current is readonly; use go()
machine.current = 'done';

// It still works with a pre-declared readonly list.
const PHASES = ['draft', 'review', 'live'] as const;
const phase = createMachine({ states: PHASES, initial: 'review' });
type _phase = Expect<Equal<typeof phase.current, 'draft' | 'review' | 'live'>>;

// --- withDefault: the value decides T
declare const role: 'admin' | 'member' | undefined;
const r = withDefault(role, 'member');
type _r = Expect<Equal<typeof r, 'admin' | 'member'>>;
// @ts-expect-error 'guest' is not a role; it must not join the union
withDefault(role, 'guest');

declare const port: number | undefined;
const p = withDefault(port, 3000);
type _p = Expect<Equal<typeof p, number>>;
// @ts-expect-error a string fallback for a number
withDefault(port, '3000');

declare const tags: string[] | undefined;
const t = withDefault(tags, []);
type _t = Expect<Equal<typeof t, string[]>>;

// --- retry: fn decides T
interface User { id: number; name: string }
declare function loadUser(): Promise<User>;

const u = retry(loadUser, { attempts: 3, onGiveUp: () => ({ id: 0, name: 'anonymous' }) });
type _u = Expect<Equal<typeof u, Promise<User>>>;
// @ts-expect-error null is not a User; the fallback must not widen T
retry(loadUser, { attempts: 3, onGiveUp: () => null });
// @ts-expect-error the fallback must be a whole User
retry(loadUser, { attempts: 3, onGiveUp: () => ({ id: 0 }) });

// Opting in to null is explicit at the call site.
const maybe = retry<User | null>(loadUser, { attempts: 3, onGiveUp: () => null });
type _maybe = Expect<Equal<typeof maybe, Promise<User | null>>>;

// The error is honest: unknown, not any.
retry(loadUser, {
  attempts: 2,
  onGiveUp: (lastError) => {
    type _e = Expect<Equal<typeof lastError, unknown>>;
    return { id: -1, name: String(lastError) };
  },
});
