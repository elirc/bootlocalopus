import { toDate, getSetting, findById } from './solution';

// --- toDate: a table of cases
const d = toDate('2024-01-01T00:00:00Z');
type _d = Expect<Equal<typeof d, Date>>;
const n = toDate(null);
type _n = Expect<Equal<typeof n, null>>;

// A caller holding the union still compiles, and gets the union back.
declare const maybe: string | null;
const m = toDate(maybe);
type _m = Expect<Equal<typeof m, Date | null>>;

// @ts-expect-error undefined is not accepted
toDate(undefined);
// @ts-expect-error nor are timestamps
toDate(1700000000000);

// --- getSetting: one generic signature, looked up by key
const size = getSetting('pageSize');
type _size = Expect<Equal<typeof size, number>>;
const theme = getSetting('theme');
type _theme = Expect<Equal<typeof theme, 'light' | 'dark'>>;
declare const someKey: 'theme' | 'beta';
const either = getSetting(someKey);
type _either = Expect<Equal<typeof either, 'light' | 'dark' | boolean>>;
// @ts-expect-error not a setting
getSetting('colour');

// --- findById: overloads over a generic
interface User { id: string; email: string }
declare const users: User[];

const u1 = findById(users, 'u1');
type _u1 = Expect<Equal<typeof u1, User | undefined>>;
const u2 = findById(users, 'u1', { required: true });
type _u2 = Expect<Equal<typeof u2, User>>;
const email: string = findById(users, 'u1', { required: true }).email;
const u3 = findById(users, 'u1', { required: false });
type _u3 = Expect<Equal<typeof u3, User | undefined>>;

declare const opts: { required: boolean };
const u4 = findById(users, 'u1', opts);
type _u4 = Expect<Equal<typeof u4, User | undefined>>;

// A readonly list works; the element type is preserved, not widened to { id: string }.
declare const frozen: readonly User[];
const u5 = findById(frozen, 'u2', { required: true });
type _u5 = Expect<Equal<typeof u5, User>>;

// @ts-expect-error items need a string id
findById([{ id: 1 }], '1');
// @ts-expect-error required must be a boolean
findById(users, 'u1', { required: 'yes' });
