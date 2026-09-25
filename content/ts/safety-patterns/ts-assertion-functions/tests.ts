import { assert, assertDefined, ensure, Draft, AssertionError } from './solution';
import type { Publishable } from './solution';

interface User { id: string; manager: User | null }

// --- assert: narrows by any condition
declare const input: string | number;
assert(typeof input === 'string', 'expected text');
type _input = Expect<Equal<typeof input, string>>;

declare const maybeUser: User | undefined;
assert(maybeUser !== undefined, 'no user');
const id: string = maybeUser.id;

// --- assertDefined: removes null and undefined, nothing else
declare const manager: User | null | undefined;
assertDefined(manager, 'manager');
type _manager = Expect<Equal<typeof manager, User>>;

declare const port: number | undefined;
assertDefined(port, 'port');
type _port = Expect<Equal<typeof port, number>>;

// It is generic: the narrowed type is whatever was passed, minus null/undefined.
declare const tags: readonly string[] | null;
assertDefined(tags, 'tags');
type _tags = Expect<Equal<typeof tags, readonly string[]>>;

// --- ensure.*: assertion methods on an object, callable without TS2775
declare const body: Record<string, unknown>;
const email = body.email;
ensure.string(email, 'email');
type _email = Expect<Equal<typeof email, string>>;

const qty = body.qty;
ensure.finiteNumber(qty, 'qty');
type _qty = Expect<Equal<typeof qty, number>>;

const role = body.role;
ensure.oneOf(role, ['admin', 'member', 'guest'], 'role');
type _role = Expect<Equal<typeof role, 'admin' | 'member' | 'guest'>>;

const PLANS = ['free', 'pro'] as const;
const plan = body.plan;
ensure.oneOf(plan, PLANS, 'plan');
type _plan = Expect<Equal<typeof plan, 'free' | 'pro'>>;

// @ts-expect-error allowed values are strings
ensure.oneOf(role, [1, 2], 'role');

// --- a method that asserts something about `this`
// (The variable is annotated: assertion calls need an explicitly typed target, even `draft.x()`.)
const draft: Draft = new Draft();
// @ts-expect-error title may be missing before the check
const before: string = draft.title;
draft.assertPublishable();
const title: string = draft.title;
const at: Date = draft.publishAt;
type _publishable = Expect<Equal<Publishable, Draft & { title: string; publishAt: Date }>>;

// --- assertion functions return nothing usable
type _assertReturn = Expect<Equal<ReturnType<typeof assert>, void>>;
const err: Error = new AssertionError('x');
// @ts-expect-error the message is required
assert(true);
