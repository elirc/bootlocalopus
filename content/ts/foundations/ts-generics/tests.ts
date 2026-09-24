import { pluck, indexById, pick, sortBy, merge } from './solution';

interface User {
  id: number;
  name: string;
  admin: boolean;
}
declare const users: User[];

// pluck keeps the property's type.
const names = pluck(users, 'name');
type _names = Expect<Equal<typeof names, string[]>>;
const flags = pluck(users, 'admin');
type _flags = Expect<Equal<typeof flags, boolean[]>>;
// @ts-expect-error not a key of User
pluck(users, 'nope');

// indexById requires an id and keeps the element type.
const byId = indexById(users);
type _byId = Expect<Equal<typeof byId, Record<string, User>>>;
const first: User | undefined = byId['1'];
// @ts-expect-error no id on this element type
indexById([{ name: 'x' }]);

// pick returns exactly the requested keys.
declare const user: User;
const small = pick(user, ['id', 'name']);
type _small = Expect<Equal<typeof small, Pick<User, 'id' | 'name'>>>;
const justId: number = pick(user, ['id']).id;
// @ts-expect-error name was not picked
pick(user, ['id']).name;
// @ts-expect-error not a key of User
pick(user, ['missing']);

// sortBy keeps the array type and only accepts real keys.
const sorted = sortBy(users, 'name');
type _sorted = Expect<Equal<typeof sorted, User[]>>;
// @ts-expect-error not a key of User
sortBy(users, 'height');

// merge intersects.
const merged = merge({ a: 1 }, { b: 'two' });
const a: number = merged.a;
const b: string = merged.b;
type _merged = Expect<Equal<typeof merged, { a: number } & { b: string }>>;
