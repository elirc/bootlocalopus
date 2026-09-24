import type { Getter, Getters, EventName, RouteParams, Split } from './solution';

type _getter = Expect<Equal<Getter<'name'>, 'getName'>>;
type _getterMulti = Expect<Equal<Getter<'firstName'>, 'getFirstName'>>;

type User = { id: number; name: string };
type UserGetters = Getters<User>;
type _getterKeys = Expect<Equal<keyof UserGetters, 'getId' | 'getName'>>;
type _getterValue = Expect<Equal<UserGetters['getName'], () => string>>;
type _getterValue2 = Expect<Equal<UserGetters['getId'], () => number>>;

type _event = Expect<Equal<EventName<'click'>, 'onClick'>>;
type _eventUnion = Expect<Equal<EventName<'click' | 'focus'>, 'onClick' | 'onFocus'>>;

// A route's params are readable straight off the pattern string.
type One = RouteParams<'/users/:userId'>;
type _one = Expect<Equal<One, { userId: string }>>;

type Two = RouteParams<'/users/:userId/posts/:postId'>;
declare const two: Two;
const u: string = two.userId;
const p: string = two.postId;
type _twoKeys = Expect<Equal<keyof Two, 'userId' | 'postId'>>;

type None = RouteParams<'/health'>;
type _none = Expect<Equal<keyof None, never>>;

type _split = Expect<Equal<Split<'a,b,c', ','>, ['a', 'b', 'c']>>;
type _splitOne = Expect<Equal<Split<'abc', ','>, ['abc']>>;
type _splitPath = Expect<Equal<Split<'users/1/posts', '/'>, ['users', '1', 'posts']>>;
