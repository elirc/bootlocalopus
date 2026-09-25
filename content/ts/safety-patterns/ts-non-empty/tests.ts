import { isNonEmpty, first, last, maxBy, mapNonEmpty, groupByKey } from './solution';
import type { NonEmptyArray, ReadonlyNonEmptyArray } from './solution';

interface User { name: string; age: number; team: string }
declare const users: User[];
declare const frozenUsers: readonly User[];

// --- the types
const one: NonEmptyArray<number> = [1];
const many: NonEmptyArray<number> = [1, 2, 3];
// @ts-expect-error empty is not non-empty
const none: NonEmptyArray<number> = [];
type _head = Expect<Equal<NonEmptyArray<string>[0], string>>;
const ro: ReadonlyNonEmptyArray<string> = ['a'];
// @ts-expect-error readonly
ro.push('b');

// --- functions that need an element demand one, and never return undefined
const f = first([3, 1, 2]);
type _f = Expect<Equal<typeof f, number>>;
const l = last(many);
type _l = Expect<Equal<typeof l, number>>;
// @ts-expect-error an empty literal
first([]);
// @ts-expect-error a plain array might be empty
first(users);
// @ts-expect-error a readonly array might be empty too
last(frozenUsers);
const letters = ['a', 'b'] as const;
const a = first(letters);
type _a = Expect<Equal<typeof a, 'a' | 'b'>>;

// --- isNonEmpty turns a plain array into a non-empty one
if (isNonEmpty(users)) {
  const oldest: User = maxBy(users, (u) => u.age);
  const firstUser: User = first(users);
  type _mutable = Expect<Equal<(typeof users)[0], User>>;
  users.push(firstUser); // a mutable array stays mutable
} else {
  // @ts-expect-error still possibly empty here
  first(users);
}
if (isNonEmpty(frozenUsers)) {
  const youngest: User = maxBy(frozenUsers, (u) => -u.age);
  // @ts-expect-error a readonly array stays readonly
  frozenUsers.push(youngest);
}

// --- maxBy: a result, not a maybe
declare const nonEmptyUsers: NonEmptyArray<User>;
const top = maxBy(nonEmptyUsers, (u) => u.age);
type _top = Expect<Equal<typeof top, User>>;
// @ts-expect-error the score must be a number
maxBy(nonEmptyUsers, (u) => u.name);

// --- mapping keeps the guarantee
const names = mapNonEmpty(nonEmptyUsers, (u) => u.name);
type _names = Expect<Equal<typeof names, NonEmptyArray<string>>>;
const indexed = mapNonEmpty(nonEmptyUsers, (u, i) => i);
type _indexed = Expect<Equal<typeof indexed, NonEmptyArray<number>>>;

// --- groups built from items are never empty
const byTeam = groupByKey(users, (u) => u.team);
type _byTeam = Expect<Equal<typeof byTeam, Map<string, NonEmptyArray<User>>>>;
const platform = byTeam.get('platform');
if (platform) {
  const lead: User = first(platform);
}
const byAge = groupByKey(users, (u) => u.age);
type _byAge = Expect<Equal<typeof byAge, Map<number, NonEmptyArray<User>>>>;
