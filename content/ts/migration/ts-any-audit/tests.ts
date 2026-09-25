import { readJson, totalCents, errorMessage, pluck, createCache, isUser } from './solution';
import type { Line, User } from './solution';

declare const text: string;
declare const lines: Line[];
declare const users: User[];

// ---------- readJson needs a check ----------
const user = readJson(text, isUser);
type _r1 = Expect<Equal<typeof user, User>>;
// @ts-expect-error a type argument alone is not a check: pass a guard
readJson<User>(text);
const ids = readJson(text, (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string'));
type _r2 = Expect<Equal<typeof ids, string[]>>;

// ---------- totalCents ----------
const total = totalCents(lines);
type _t1 = Expect<Equal<typeof total, number>>;
// @ts-expect-error only lines can be totalled
totalCents([{ sku: 'A', price: 100, qty: 1 }]);

// ---------- errorMessage accepts anything and returns a string ----------
type _e1 = Expect<Equal<Parameters<typeof errorMessage>[0], unknown>>;
type _e2 = Expect<Equal<ReturnType<typeof errorMessage>, string>>;

// ---------- pluck ----------
const names = pluck(users, 'name');
type _p1 = Expect<Equal<typeof names, string[]>>;
// @ts-expect-error not a key of User
pluck(users, 'email');

// ---------- cache ----------
const cache = createCache<User>();
const hit = cache.get('u1', 0);
type _c1 = Expect<Equal<typeof hit, User | undefined>>;
cache.set('u1', { id: 'u1', name: 'Ada' }, 1000);
// @ts-expect-error the cache holds Users
cache.set('u2', 'Grace', 1000);

// ---------- isUser takes unknown ----------
type _u = Expect<Equal<Parameters<typeof isUser>[0], unknown>>;

// ---------- nothing leaks any ----------
type _a1 = ExpectFalse<IsAny<typeof user>>;
type _a2 = ExpectFalse<IsAny<typeof total>>;
type _a3 = ExpectFalse<IsAny<typeof names>>;
type _a4 = ExpectFalse<IsAny<typeof hit>>;
type _a5 = ExpectFalse<IsAny<Parameters<typeof totalCents>[0]>>;
type _a6 = ExpectFalse<IsAny<Parameters<typeof pluck>[0]>>;
