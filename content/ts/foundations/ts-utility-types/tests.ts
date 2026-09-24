import type {
  MyPartial, MyRequired, MyReadonly, MyPick, MyOmit, MyRecord, DeepReadonly,
} from './solution';

interface User {
  id: number;
  name: string;
  admin?: boolean;
}

type _partial = Expect<Equal<MyPartial<User>, { id?: number; name?: string; admin?: boolean }>>;
type _required = Expect<Equal<MyRequired<User>, { id: number; name: string; admin: boolean }>>;
type _readonly = Expect<Equal<
  MyReadonly<{ a: number; b: string }>,
  { readonly a: number; readonly b: string }
>>;
type _pick = Expect<Equal<MyPick<User, 'id' | 'name'>, { id: number; name: string }>>;
type _omit = Expect<Equal<MyOmit<User, 'admin'>, { id: number; name: string }>>;
type _record = Expect<Equal<MyRecord<'a' | 'b', number>, { a: number; b: number }>>;

// Constraints are enforced.
// @ts-expect-error "nope" is not a key of User
type _badPick = MyPick<User, 'nope'>;
// @ts-expect-error "nope" is not a key of User
type _badOmit = MyOmit<User, 'nope'>;

// DeepReadonly recurses through nesting and arrays...
type Config = {
  name: string;
  server: { port: number; hosts: string[] };
  onReady: () => void;
};
type Frozen = DeepReadonly<Config>;

type _deepTop = Expect<Equal<Frozen['name'], string>>;
type _deepNested = Expect<Equal<Frozen['server']['port'], number>>;
type _deepArray = Expect<Equal<Frozen['server']['hosts'], readonly string[]>>;
// ...but leaves functions callable rather than mapping over their properties.
type _deepFn = Expect<Equal<Frozen['onReady'], () => void>>;

declare const frozen: Frozen;
// @ts-expect-error readonly, top level
frozen.name = 'x';
// @ts-expect-error readonly, nested
frozen.server.port = 1;
// @ts-expect-error readonly array
frozen.server.hosts.push('x');
// A primitive passes straight through.
type _prim = Expect<Equal<DeepReadonly<number>, number>>;
