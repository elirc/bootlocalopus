import { withLogging, once, partial, memoizeAsync } from './solution';

declare const log: (line: string) => void;

// --- withLogging: the wrapper has exactly the wrapped signature
const add = withLogging('add', (a: number, b: number) => a + b, log);
type _add = Expect<Equal<typeof add, (a: number, b: number) => number>>;
type _notAny = ExpectFalse<IsAny<ReturnType<typeof add>>>;
// @ts-expect-error wrong argument type
add('1', 2);
// @ts-expect-error missing argument
add(1);

// Optional parameters stay optional.
const greet = withLogging('greet', (name: string, punctuation?: string) => name + (punctuation ?? '!'), log);
greet('ada');
greet('ada', '?');
// @ts-expect-error too many arguments
greet('ada', '?', 'extra');

// --- once: a generic function stays generic through the wrapper
const first = once(<T>(value: T) => value);
const n: number = first(42);
const shout: string = first('hi').toUpperCase();
type _firstNotAny = ExpectFalse<IsAny<ReturnType<typeof first>>>;

const init = once(() => ({ ready: true }));
type _init = Expect<Equal<ReturnType<typeof init>, { ready: boolean }>>;

// --- partial: fixes the first argument, keeps the rest
interface Db { url: string }
interface Row { id: number }
declare const db: Db;
declare function query(db: Db, sql: string, params?: unknown[]): Promise<Row[]>;

const run = partial(query, db);
type _run = Expect<Equal<typeof run, (sql: string, params?: unknown[]) => Promise<Row[]>>>;
run('select 1');
run('select $1', [1]);
// @ts-expect-error the first argument must match the wrapped function's first parameter
partial(query, { host: 'x' });
// @ts-expect-error db is already bound
run(db, 'select 1');

// --- memoizeAsync: the key function's parameters are inferred from fn
interface User { id: string; name: string }
declare function fetchUser(id: string, opts?: { fresh: boolean }): Promise<User>;

const cachedUser = memoizeAsync(fetchUser, (id) => {
  type _id = Expect<Equal<typeof id, string>>;
  return id;
});
type _cached = Expect<Equal<typeof cachedUser, (id: string, opts?: { fresh: boolean }) => Promise<User>>>;
// @ts-expect-error the key function must return a string
memoizeAsync(fetchUser, (id) => id.length);
// @ts-expect-error memoizeAsync only wraps functions that return promises
memoizeAsync((id: string) => id, (id) => id);
