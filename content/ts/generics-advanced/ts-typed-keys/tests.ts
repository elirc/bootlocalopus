import { key, Context } from './solution';
import type { Key } from './solution';

interface User { id: string; name: string }
type Status = 'draft' | 'live';

const UserKey = key<User>('user');
const CountKey = key<number>('count');
const StatusKey = key<Status>('status');
const NameKey = key<string>('name');

type _userKey = Expect<Equal<typeof UserKey, Key<User>>>;
type _name = Expect<Equal<typeof UserKey.name, string>>;
type _notAny = ExpectFalse<IsAny<Key<User>>>;

// --- the phantom type makes keys of different types different types
type _distinct = ExpectFalse<Equal<Key<string>, Key<number>>>;
// @ts-expect-error a Key<number> is not a Key<string>
const wrongKey: Key<string> = CountKey;

// --- and invariant: a narrow key is not a wide key, nor the other way round
// @ts-expect-error through a Key<string>, someone could set 'archived' where readers expect Status
const widened: Key<string> = StatusKey;
// @ts-expect-error a Key<string> could hold any string, not just a Status
const narrowed: Key<Status> = NameKey;

// --- Context reads back the type the key carries, with no casts
const ctx = new Context();
const chained = ctx.set(UserKey, { id: 'u1', name: 'Ada' }).set(CountKey, 3).set(StatusKey, 'live');
type _chain = Expect<Equal<typeof chained, Context>>;

const maybeUser = ctx.get(UserKey);
type _get = Expect<Equal<typeof maybeUser, User | undefined>>;
const user = ctx.require(UserKey);
type _require = Expect<Equal<typeof user, User>>;
const count = ctx.require(CountKey);
type _count = Expect<Equal<typeof count, number>>;
const status = ctx.get(StatusKey);
type _status = Expect<Equal<typeof status, Status | undefined>>;
const present: boolean = ctx.has(UserKey) && ctx.has(StatusKey);

// --- writes are checked against the key
// @ts-expect-error a string is not a number
ctx.set(CountKey, '3');
// @ts-expect-error not a Status
ctx.set(StatusKey, 'archived');
// @ts-expect-error a partial user is not a User
ctx.set(UserKey, { id: 'u1' });
// @ts-expect-error plain strings are not keys
ctx.get('user');

// --- subclass instances keep their own type through the chain
class RequestContext extends Context {
  readonly requestId = 'req_1';
}
const rc = new RequestContext().set(CountKey, 1);
const rid: string = rc.requestId;
