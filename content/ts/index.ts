import { track } from '../types.ts';

export const tsTrack = track({
  id: 'ts',
  title: 'TypeScript for Production',
  icon: 'TS',
  color: '#3178c6',
  weight: 1,
  blurb: 'Types that catch real bugs instead of decorating your code. Graded by the actual compiler in strict mode — if tsc is happy, you pass.',
  chapters: [
    /* ================================================================== */
    {
      id: 'ts-foundations',
      title: 'Type Foundations',
      summary: 'Narrowing, unions, generics and the utility types — rebuilt from scratch so you know what they do.',
      lessons: [
        {
          id: 'ts-narrowing',
          title: 'Narrowing and type guards',
          kind: 'typecheck',
          xp: 60,
          why: 'Where `any` sneaks into a codebase: nobody knew how to narrow `unknown` properly.',
          tags: ['narrowing', 'type guards', 'unknown'],
          brief: `Data crossing your boundary (\`JSON.parse\`, \`localStorage\`, an untyped
library) is \`unknown\`. Narrowing is how you get from \`unknown\` to something
usable without lying to the compiler.

This lesson is graded by \`tsc --strict\`. There are no runtime tests: make the
compiler happy and you are done.

## Task

Implement four exports, with no \`any\` and no type assertions (\`as\`):

- \`isString(value: unknown): value is string\`
- \`isNonNull<T>(value: T | null | undefined): value is T\`
- \`hasKey\` — \`<K extends string>(value: unknown, key: K)\` returning a predicate
  that the caller can use to read \`value[key]\`
- \`describe(value: unknown): string\` — \`"string: hi"\`, \`"number: 42"\`,
  \`"array of 3"\`, \`"object"\`, or \`"nothing"\` for null/undefined

The spec also filters an array with \`isNonNull\` and expects the result to be
\`string[]\`, not \`(string | null)[]\`.`,
          starter: `export function isString(value: unknown) {
  // TODO: give this a type predicate return type
  return typeof value === 'string';
}

export function isNonNull(value: unknown) {
  // TODO: make this generic and predicate-typed
  return value != null;
}

export function hasKey(value: unknown, key: string) {
  // TODO
  return false;
}

export function describe(value: unknown): string {
  // TODO
  return '';
}
`,
          hints: [
            'A type predicate is the return type `value is string`. It tells the compiler what a `true` result proves.',
            'For `isNonNull`, the signature is `<T>(value: T | null | undefined): value is T`. Used in `.filter(isNonNull)` it removes null from the element type.',
            'For `hasKey`, the useful signature is `(value: unknown, key: K): value is Record<K, unknown>` — after it, `value[key]` is `unknown`, which is honest and still narrowable.',
            'Inside `describe`, `typeof value === "object" && value !== null` is what separates a real object from `null`, because `typeof null === "object"`.',
          ],
          solution: `export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function hasKey<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

export function describe(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'string') return 'string: ' + value;
  if (typeof value === 'number') return 'number: ' + value;
  if (Array.isArray(value)) return 'array of ' + value.length;
  if (typeof value === 'object') return 'object';
  return typeof value;
}
`,
          tests: `import { isString, isNonNull, hasKey, describe } from './solution';

// isString must narrow, not just return a boolean.
declare const raw: unknown;
if (isString(raw)) {
  const upper: string = raw.toUpperCase();
  type _s = Expect<Equal<typeof raw, string>>;
}

// isNonNull must be generic enough to clean up an array's element type.
const mixed: (string | null | undefined)[] = ['a', null, 'b', undefined];
const clean = mixed.filter(isNonNull);
type _clean = Expect<Equal<typeof clean, string[]>>;

const nums: (number | null)[] = [1, null, 2];
type _nums = Expect<Equal<ReturnType<typeof nums.filter<number>>, number[]>>;

// hasKey lets us read a property off unknown data without an assertion.
declare const payload: unknown;
if (hasKey(payload, 'id')) {
  const id: unknown = payload.id;
  if (isString(id)) {
    const asString: string = id;
  }
}

// describe returns a string for any input.
const d: string = describe(raw);
type _d = Expect<Equal<ReturnType<typeof describe>, string>>;

// No implicit any leaked out of the signatures.
type _noAnyString = ExpectFalse<IsAny<Parameters<typeof isString>[0]>>;
type _noAnyDescribe = ExpectFalse<IsAny<ReturnType<typeof describe>>>;
`,
        },
        {
          id: 'ts-discriminated-union',
          title: 'Discriminated unions and exhaustiveness',
          kind: 'typecheck',
          xp: 70,
          why: 'The single highest-value pattern in TypeScript: makes impossible states unrepresentable and new cases a compile error.',
          tags: ['unions', 'exhaustiveness', 'state machines'],
          brief: `\`{ loading: boolean; data?: User; error?: string }\` allows
\`loading: true\` *with* an error *and* data — four booleans of nonsense. A
discriminated union allows only the states that exist.

The prize: add a new state and every \`switch\` that forgot to handle it fails to
compile.

## Task

Define and export:

- \`RequestState<T>\` — a union of exactly four members discriminated by a
  \`status\` field: \`'idle'\`, \`'loading'\`, \`'success'\` (with \`data: T\`), and
  \`'error'\` (with \`error: Error\`). Only the success member may have \`data\`;
  only the error member may have \`error\`.
- \`render<T>(state: RequestState<T>): string\` — \`'idle'\`, \`'spinner'\`,
  \`'data'\`, \`'error: <message>'\`.
- \`assertNever(value: never): never\` — throws. Call it in \`render\`'s default
  branch so a fifth state becomes a compile error.`,
          starter: `export type RequestState<T> = {
  // TODO: replace this loose shape with a real discriminated union
  status: string;
  data?: T;
  error?: Error;
};

export function assertNever(value: never): never {
  throw new Error('unexpected: ' + JSON.stringify(value));
}

export function render<T>(state: RequestState<T>): string {
  // TODO: switch on the discriminant and finish with assertNever
  return '';
}
`,
          hints: [
            'Write it as four object types joined by `|`: `{ status: "idle" } | { status: "loading" } | { status: "success"; data: T } | { status: "error"; error: Error }`.',
            'Inside `switch (state.status)`, each `case` narrows `state` to that member, so `state.data` is only reachable in the success branch.',
            'In `default`, call `return assertNever(state)`. If every case is handled, `state` is `never` there and it compiles; miss one and the argument is not assignable to `never`.',
          ],
          solution: `export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export function assertNever(value: never): never {
  throw new Error('unexpected: ' + JSON.stringify(value));
}

export function render<T>(state: RequestState<T>): string {
  switch (state.status) {
    case 'idle':
      return 'idle';
    case 'loading':
      return 'spinner';
    case 'success':
      return 'data';
    case 'error':
      return 'error: ' + state.error.message;
    default:
      // Compile-time proof that every case above is handled.
      return assertNever(state);
  }
}
`,
          tests: `import { render, assertNever } from './solution';
import type { RequestState } from './solution';

// All four states are constructible.
const idle: RequestState<string> = { status: 'idle' };
const loading: RequestState<string> = { status: 'loading' };
const ok: RequestState<{ id: number }> = { status: 'success', data: { id: 1 } };
const bad: RequestState<string> = { status: 'error', error: new Error('boom') };

const out: string = render(ok);

// Narrowing works: data is only available on the success member.
declare const state: RequestState<number>;
if (state.status === 'success') {
  const n: number = state.data;
  type _d = Expect<Equal<typeof state.data, number>>;
}
if (state.status === 'error') {
  const msg: string = state.error.message;
}

// The union must have exactly these four discriminants.
type Statuses = RequestState<unknown>['status'];
type _statuses = Expect<Equal<Statuses, 'idle' | 'loading' | 'success' | 'error'>>;

// Impossible states must be rejected.
// @ts-expect-error idle carries no data
const wrong1: RequestState<string> = { status: 'idle', data: 'nope' };
// @ts-expect-error success requires data
const wrong2: RequestState<string> = { status: 'success' };
// @ts-expect-error there is no such status
const wrong3: RequestState<string> = { status: 'pending' };
// @ts-expect-error error state carries an Error, not a string
const wrong4: RequestState<string> = { status: 'error', error: 'boom' };

// assertNever only accepts never.
declare const nothing: never;
const n2: never = assertNever(nothing);
// @ts-expect-error a real value is not assignable to never
assertNever('surprise');
`,
        },
        {
          id: 'ts-generics',
          title: 'Generics with real constraints',
          kind: 'typecheck',
          xp: 75,
          why: 'Generic helpers that keep their types are the difference between a useful util and a cast farm.',
          tags: ['generics', 'keyof', 'constraints'],
          brief: `A generic without a constraint is barely better than \`any\`. The interesting
work is in \`extends\`: expressing "a key of this object" or "anything with an
id" so the return type follows from the argument.

## Task

Export, all generic and all preserving the caller's types:

- \`pluck<T, K extends keyof T>(items: T[], key: K): T[K][]\`
- \`indexById<T extends { id: string | number }>(items: T[]): Record<string, T>\`
- \`pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>\`
- \`sortBy<T>(items: T[], key: keyof T): T[]\` — must reject keys whose value is
  not comparable? No: keep it simple, any key is fine, but the return type must
  stay \`T[]\`.
- \`merge<A, B>(a: A, b: B): A & B\``,
          starter: `export function pluck(items, key) {
  // TODO: add type parameters
  return items.map((item) => item[key]);
}

export function indexById(items) {
  // TODO
  return {};
}

export function pick(obj, keys) {
  // TODO
  return {};
}

export function sortBy(items, key) {
  // TODO
  return items;
}

export function merge(a, b) {
  // TODO
  return { ...a, ...b };
}
`,
          hints: [
            '`pluck<T, K extends keyof T>(items: T[], key: K): T[K][]` — the constraint `K extends keyof T` is what makes `item[key]` legal.',
            'For `pick`, build the result with a loop and start from `{} as Pick<T, K>`; one assertion in an internal builder is the pragmatic choice here.',
            '`indexById` needs `T extends { id: string | number }` so `item.id` is known to exist.',
            '`merge` returns `A & B`; `{ ...a, ...b } as A & B` is the usual pragmatic implementation.',
          ],
          solution: `export function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

export function indexById<T extends { id: string | number }>(items: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[String(item.id)] = item;
  return out;
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}

export function sortBy<T>(items: T[], key: keyof T): T[] {
  return [...items].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
}

export function merge<A, B>(a: A, b: B): A & B {
  return { ...a, ...b } as A & B;
}
`,
          tests: `import { pluck, indexById, pick, sortBy, merge } from './solution';

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
`,
        },
        {
          id: 'ts-utility-types',
          title: 'Rebuild the utility types',
          kind: 'typecheck',
          xp: 80,
          why: 'Once you have written Pick and Omit yourself, mapped types stop looking like magic.',
          tags: ['mapped types', 'keyof', 'utility types'],
          brief: `\`Pick\`, \`Omit\`, \`Partial\` and friends are ordinary TypeScript, about one
line each. Writing them is the fastest way to learn mapped types.

## Task

Define and export these type aliases **without** using the built-in versions:

- \`MyPartial<T>\` — every property optional
- \`MyRequired<T>\` — every property required (strip \`?\`)
- \`MyReadonly<T>\` — every property readonly
- \`MyPick<T, K extends keyof T>\`
- \`MyOmit<T, K extends keyof T>\`
- \`MyRecord<K extends keyof any, V>\`
- \`DeepReadonly<T>\` — recursive, and it must leave functions and primitives
  alone while still recursing into arrays`,
          starter: `export type MyPartial<T> = T;      // TODO
export type MyRequired<T> = T;     // TODO
export type MyReadonly<T> = T;     // TODO
export type MyPick<T, K extends keyof T> = T;   // TODO
export type MyOmit<T, K extends keyof T> = T;   // TODO
export type MyRecord<K extends keyof any, V> = unknown;  // TODO
export type DeepReadonly<T> = T;   // TODO
`,
          hints: [
            'The mapped type shape is `{ [K in keyof T]: T[K] }`. Add `?` for Partial and `-?` to remove it for Required.',
            '`readonly [K in keyof T]` adds the modifier; `MyPick` maps over `K` instead of `keyof T`.',
            'For Omit, the trick is `Exclude<keyof T, K>` — or, from first principles, a key remapping: `[P in keyof T as P extends K ? never : P]: T[P]`.',
            'For `DeepReadonly`, recurse conditionally: functions pass through, arrays become `ReadonlyArray<DeepReadonly<E>>`, objects map recursively, everything else is returned as is.',
          ],
          solution: `export type MyPartial<T> = { [K in keyof T]?: T[K] };

export type MyRequired<T> = { [K in keyof T]-?: T[K] };

export type MyReadonly<T> = { readonly [K in keyof T]: T[K] };

export type MyPick<T, K extends keyof T> = { [P in K]: T[P] };

// Key remapping with \`as\` drops the excluded keys without needing Exclude.
export type MyOmit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] };

export type MyRecord<K extends keyof any, V> = { [P in K]: V };

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer E)[] ? ReadonlyArray<DeepReadonly<E>>
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
`,
          tests: `import type {
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
`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'ts-type-level',
      title: 'Type-Level Tools',
      summary: 'infer, conditional types, template literals, and `satisfies` — the tools behind typed libraries.',
      lessons: [
        {
          id: 'ts-conditional',
          title: 'Conditional types and key filtering',
          kind: 'typecheck',
          xp: 80,
          why: 'How library authors derive one type from another instead of asking you to repeat yourself.',
          tags: ['conditional types', 'mapped types'],
          brief: `A conditional type is a type-level \`if\`: \`T extends U ? X : Y\`. Combined
with key remapping it lets you filter an object's keys by their *value* type.

## Task

Export:

- \`FunctionKeys<T>\` — a union of the keys whose values are functions
- \`DataKeys<T>\` — the keys whose values are **not** functions
- \`Methods<T>\` — the object with only the function-valued properties
- \`NonNullableProps<T>\` — every property with null and undefined removed from
  its type (the property stays required)
- \`Flatten<T>\` — removes one level of *nesting*: \`string[][]\` becomes
  \`string[]\`, while an already-flat \`number[]\` and a non-array are returned
  unchanged
- \`Unionise<T>\` — an object type to a union of \`{ key, value }\` pairs

One trap is deliberate: a conditional type over a bare type parameter
distributes over unions, and \`boolean\` is a union (\`true | false\`). If a
result comes back looking like nonsense, that is why.`,
          starter: `export type FunctionKeys<T> = keyof T;        // TODO
export type DataKeys<T> = keyof T;            // TODO
export type Methods<T> = T;                   // TODO
export type NonNullableProps<T> = T;          // TODO
export type Flatten<T> = T;                   // TODO
export type Unionise<T> = never;              // TODO
`,
          hints: [
            'To collect keys conditionally, map to the key itself or to `never`, then index: `{ [K in keyof T]: T[K] extends Fn ? K : never }[keyof T]`. The `never` members vanish from the union.',
            'Use `(...args: never[]) => unknown` as the "is a function" test — it is safer than `Function` and accepts any signature.',
            'For `Methods<T>`, `Pick<T, FunctionKeys<T>>` is the short version.',
            'For `Flatten<T>`, infer the element, then ask whether the element is itself an array: only then is it the answer.',
            'A conditional over a bare type parameter DISTRIBUTES over unions, and `boolean` is secretly `true | false`. Wrap both sides in a tuple — `[E] extends [readonly unknown[]]` — to compare the union as a whole.',
            'For `Unionise<T>`, map each key to `{ key: K; value: T[K] }` then index with `[keyof T]` to collapse the object into a union.',
          ],
          solution: `type AnyFn = (...args: never[]) => unknown;

export type FunctionKeys<T> = {
  [K in keyof T]-?: T[K] extends AnyFn ? K : never;
}[keyof T];

export type DataKeys<T> = {
  [K in keyof T]-?: T[K] extends AnyFn ? never : K;
}[keyof T];

export type Methods<T> = Pick<T, FunctionKeys<T>>;

export type NonNullableProps<T> = { [K in keyof T]-?: NonNullable<T[K]> };

// Only unwrap when the element is itself an array, so number[] stays number[].
// The [E] extends [...] brackets stop the conditional distributing over unions:
// a naked E would split boolean into true | false and hand back a mess.
export type Flatten<T> = T extends readonly (infer E)[]
  ? ([E] extends [readonly unknown[]] ? E : T)
  : T;

export type Unionise<T> = { [K in keyof T]: { key: K; value: T[K] } }[keyof T];
`,
          tests: `import type {
  FunctionKeys, DataKeys, Methods, NonNullableProps, Flatten, Unionise,
} from './solution';

interface Store {
  count: number;
  label: string;
  increment: () => void;
  reset(to: number): void;
}

type _fnKeys = Expect<Equal<FunctionKeys<Store>, 'increment' | 'reset'>>;
type _dataKeys = Expect<Equal<DataKeys<Store>, 'count' | 'label'>>;
type _methods = Expect<Equal<keyof Methods<Store>, 'increment' | 'reset'>>;
type _methodShape = Expect<Equal<Methods<Store>['increment'], () => void>>;

type Loose = { a: string | null; b?: number; c: boolean | undefined };
type _nonNull = Expect<Equal<NonNullableProps<Loose>, { a: string; b: number; c: boolean }>>;

type _flat = Expect<Equal<Flatten<string[][]>, string[]>>;
type _flatOnce = Expect<Equal<Flatten<number[]>, number[]>>;
type _flatNoop = Expect<Equal<Flatten<string>, string>>;
type _flatReadonly = Expect<Equal<Flatten<readonly boolean[]>, readonly boolean[]>>;
type _flatDeep = Expect<Equal<Flatten<number[][][]>, number[][]>>;

type Pair = Unionise<{ a: number; b: string }>;
type _union = Expect<Equal<Pair, { key: 'a'; value: number } | { key: 'b'; value: string }>>;

// The union is genuinely discriminated: narrowing by key gives the right value type.
declare const pair: Pair;
if (pair.key === 'a') {
  const n: number = pair.value;
}

// Nothing collapsed to never or any.
type _notNever = ExpectFalse<Equal<FunctionKeys<Store>, never>>;
type _notAny = ExpectFalse<IsAny<Methods<Store>>>;
`,
        },
        {
          id: 'ts-infer',
          title: 'infer: pulling types apart',
          kind: 'typecheck',
          xp: 85,
          why: '`Awaited`, `ReturnType`, and every "give me the type inside" helper is one `infer`.',
          tags: ['infer', 'conditional types'],
          brief: `\`infer\` declares a type variable inside a conditional type: "if T looks like
this shape, capture that part and call it E".

## Task

Rebuild these from scratch (no built-in \`ReturnType\`, \`Parameters\`, or
\`Awaited\`):

- \`MyReturnType<F>\`
- \`MyParameters<F>\` — as a tuple
- \`FirstParam<F>\`
- \`ElementOf<T>\` — the element type of an array
- \`MyAwaited<T>\` — unwraps nested promises all the way down
- \`Last<T>\` — the last element type of a tuple

Each must resolve to \`never\` for inputs of the wrong shape (except
\`MyAwaited\`, which passes non-promises through unchanged).`,
          starter: `export type MyReturnType<F> = never;   // TODO
export type MyParameters<F> = never;   // TODO
export type FirstParam<F> = never;     // TODO
export type ElementOf<T> = never;      // TODO
export type MyAwaited<T> = T;          // TODO
export type Last<T> = never;           // TODO
`,
          hints: [
            '`F extends (...args: never[]) => infer R ? R : never` — the `infer R` in the return position captures the return type.',
            'For parameters, infer the whole rest tuple: `F extends (...args: infer P) => unknown ? P : never`.',
            '`MyAwaited` must recurse: `T extends Promise<infer V> ? MyAwaited<V> : T`. That unwraps `Promise<Promise<X>>`.',
            'For `Last`, match a variadic tuple: `T extends readonly [...unknown[], infer L] ? L : never`.',
            'Careful with `FirstParam`: `() => void` IS assignable to `(a: infer A) => unknown` (extra parameters are allowed), so matching that way infers `unknown` rather than `never`. Infer the whole parameter tuple first, then destructure it.',
          ],
          solution: `export type MyReturnType<F> = F extends (...args: never[]) => infer R ? R : never;

export type MyParameters<F> = F extends (...args: infer P) => unknown ? P : never;

// Going through the parameter tuple is what makes a zero-arg function never:
// matching (first: infer A, ...) directly would succeed and infer unknown.
export type FirstParam<F> = F extends (...args: infer P) => unknown
  ? (P extends [infer A, ...unknown[]] ? A : never)
  : never;

export type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

// Recursing is what handles Promise<Promise<T>>.
export type MyAwaited<T> = T extends Promise<infer V> ? MyAwaited<V> : T;

export type Last<T> = T extends readonly [...unknown[], infer L] ? L : never;
`,
          tests: `import type {
  MyReturnType, MyParameters, FirstParam, ElementOf, MyAwaited, Last,
} from './solution';

declare function load(id: number, deep: boolean): Promise<{ id: number }>;
type Loader = typeof load;

type _ret = Expect<Equal<MyReturnType<Loader>, Promise<{ id: number }>>>;
type _retVoid = Expect<Equal<MyReturnType<() => void>, void>>;
type _retBad = Expect<Equal<MyReturnType<string>, never>>;

type _params = Expect<Equal<MyParameters<Loader>, [id: number, deep: boolean]>>;
type _paramsNone = Expect<Equal<MyParameters<() => void>, []>>;
type _paramsBad = Expect<Equal<MyParameters<number>, never>>;

type _first = Expect<Equal<FirstParam<Loader>, number>>;
type _firstNone = Expect<Equal<FirstParam<() => void>, never>>;

type _el = Expect<Equal<ElementOf<string[]>, string>>;
type _elReadonly = Expect<Equal<ElementOf<readonly number[]>, number>>;
type _elUnion = Expect<Equal<ElementOf<(string | number)[]>, string | number>>;
type _elBad = Expect<Equal<ElementOf<string>, never>>;

type _await = Expect<Equal<MyAwaited<Promise<string>>, string>>;
type _awaitDeep = Expect<Equal<MyAwaited<Promise<Promise<number>>>, number>>;
type _awaitPlain = Expect<Equal<MyAwaited<boolean>, boolean>>;
type _awaitLoader = Expect<Equal<MyAwaited<MyReturnType<Loader>>, { id: number }>>;

type _last = Expect<Equal<Last<[1, 2, 3]>, 3>>;
type _lastOne = Expect<Equal<Last<['only']>, 'only'>>;
type _lastEmpty = Expect<Equal<Last<[]>, never>>;
type _lastMixed = Expect<Equal<Last<[string, number, boolean]>, boolean>>;
`,
        },
        {
          id: 'ts-template-literal',
          title: 'Template literal types',
          kind: 'typecheck',
          xp: 85,
          why: 'Typed event names, typed route params, typed CSS keys — string patterns the compiler can check.',
          tags: ['template literals', 'string types'],
          brief: `Template literal types let you build and destructure string types.
This is how libraries type \`on('userCreated')\` or extract \`:id\` from
\`'/users/:id'\`.

## Task

Export:

- \`Getter<K>\` — \`'name'\` becomes \`'getName'\` (use \`Capitalize\`)
- \`Getters<T>\` — an object type whose keys are \`getX\` and whose values return
  the original property type
- \`EventName<T>\` — \`'click'\` becomes \`'onClick'\`
- \`RouteParams<P>\` — \`'/users/:userId/posts/:postId'\` becomes
  \`{ userId: string; postId: string }\`; a route with no params becomes \`{}\`
- \`Split<S, D>\` — split a string type on a delimiter into a tuple`,
          starter: `export type Getter<K extends string> = string;          // TODO
export type Getters<T> = T;                             // TODO
export type EventName<T extends string> = string;       // TODO
export type RouteParams<P extends string> = {};         // TODO
export type Split<S extends string, D extends string> = never;  // TODO
`,
          hints: [
            'Interpolate inside a type: `` type Getter<K extends string> = `get${Capitalize<K>}` ``.',
            'For `Getters<T>`, remap keys: `` { [K in keyof T as Getter<K & string>]: () => T[K] } ``.',
            'For `RouteParams`, recurse on the pattern: match `` `${string}:${infer Param}/${infer Rest}` `` to take one param and continue, then `` `${string}:${infer Param}` `` for the final one, else `{}`.',
            'For `Split`, `` S extends `${infer Head}${D}${infer Tail}` ? [Head, ...Split<Tail, D>] : [S] ``.',
          ],
          solution: `export type Getter<K extends string> = \`get\${Capitalize<K>}\`;

export type Getters<T> = { [K in keyof T as Getter<K & string>]: () => T[K] };

export type EventName<T extends string> = \`on\${Capitalize<T>}\`;

export type RouteParams<P extends string> =
  P extends \`\${string}:\${infer Param}/\${infer Rest}\`
    ? { [K in Param]: string } & RouteParams<\`/\${Rest}\`>
    : P extends \`\${string}:\${infer Param}\`
      ? { [K in Param]: string }
      : {};

export type Split<S extends string, D extends string> =
  S extends \`\${infer Head}\${D}\${infer Tail}\` ? [Head, ...Split<Tail, D>] : [S];
`,
          tests: `import type { Getter, Getters, EventName, RouteParams, Split } from './solution';

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
`,
        },
        {
          id: 'ts-satisfies',
          title: 'const, satisfies, and derived unions',
          kind: 'typecheck',
          xp: 75,
          why: 'Stops the "I have a config object and a union of its keys that drift apart" problem for good.',
          tags: ['satisfies', 'const assertions', 'literal types'],
          brief: `\`as const\` keeps literal types instead of widening to \`string\`.
\`satisfies\` checks a value against a type **without** widening it — so you get
validation *and* the precise literal types.

## Task

Given a \`ROLES\` config, export:

- \`ROLES\` — frozen literal types, validated against
  \`Record<string, { level: number; label: string }>\` via \`satisfies\`
- \`Role\` — the union \`'viewer' | 'editor' | 'admin'\`, derived from \`ROLES\`
  (do not type it out by hand)
- \`RoleLevel\` — the union of the \`level\` values: \`1 | 2 | 3\`
- \`hasAtLeast(role: Role, min: Role): boolean\`
- \`STATUSES\` — a readonly tuple \`['todo', 'doing', 'done']\`
- \`Status\` — the union of its members

The spec proves \`ROLES.admin.level\` is \`3\` (not \`number\`) and that unknown
roles are rejected.`,
          starter: `export const ROLES = {
  viewer: { level: 1, label: 'Viewer' },
  editor: { level: 2, label: 'Editor' },
  admin: { level: 3, label: 'Admin' },
};

export type Role = string;        // TODO: derive from ROLES
export type RoleLevel = number;   // TODO: derive from ROLES

export function hasAtLeast(role: Role, min: Role): boolean {
  return ROLES[role].level >= ROLES[min].level;
}

export const STATUSES = ['todo', 'doing', 'done'];
export type Status = string;      // TODO
`,
          hints: [
            'Combine both: `} as const satisfies Record<string, { level: number; label: string }>;` — `as const` keeps the literals, `satisfies` type-checks the shape.',
            '`export type Role = keyof typeof ROLES;` derives the key union automatically.',
            'For the value union, index into the mapped type: `(typeof ROLES)[Role]["level"]`.',
            '`export const STATUSES = [...] as const;` then `export type Status = (typeof STATUSES)[number];`.',
          ],
          solution: `export const ROLES = {
  viewer: { level: 1, label: 'Viewer' },
  editor: { level: 2, label: 'Editor' },
  admin: { level: 3, label: 'Admin' },
  // \`as const\` keeps 1 | 2 | 3; \`satisfies\` still checks the shape.
} as const satisfies Record<string, { level: number; label: string }>;

export type Role = keyof typeof ROLES;
export type RoleLevel = (typeof ROLES)[Role]['level'];

export function hasAtLeast(role: Role, min: Role): boolean {
  return ROLES[role].level >= ROLES[min].level;
}

export const STATUSES = ['todo', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];
`,
          tests: `import { ROLES, hasAtLeast, STATUSES } from './solution';
import type { Role, RoleLevel, Status } from './solution';

// Literal types survived: this is 3, not number.
type _adminLevel = Expect<Equal<typeof ROLES.admin.level, 3>>;
type _label = Expect<Equal<typeof ROLES.viewer.label, 'Viewer'>>;

type _role = Expect<Equal<Role, 'viewer' | 'editor' | 'admin'>>;
type _level = Expect<Equal<RoleLevel, 1 | 2 | 3>>;

const ok: boolean = hasAtLeast('editor', 'viewer');
// @ts-expect-error not a role
hasAtLeast('superuser', 'viewer');

// The config is deeply readonly.
// @ts-expect-error readonly
ROLES.admin.level = 9;

type _statuses = Expect<Equal<Status, 'todo' | 'doing' | 'done'>>;
type _tuple = Expect<Equal<typeof STATUSES, readonly ['todo', 'doing', 'done']>>;
// @ts-expect-error readonly tuple
STATUSES.push('extra');

const s: Status = 'doing';
// @ts-expect-error not a status
const bad: Status = 'shipped';
`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'ts-boundaries',
      title: 'Types at the Boundary',
      summary: 'Where types meet untrusted data: validation, results, and a fully typed client.',
      lessons: [
        {
          id: 'ts-runtime-validator',
          title: 'A validator that narrows',
          kind: 'ts',
          xp: 95,
          why: 'Types vanish at runtime. Every API response is a lie until something checks it.',
          tags: ['validation', 'type guards', 'boundaries'],
          brief: `\`const user = await res.json() as User\` is a lie you tell the compiler.
Zod exists because you need a runtime check that also produces a type.

This lesson has **runtime** tests: build the checker and make it work.

## Task

Export a tiny schema library:

- \`string()\`, \`number()\`, \`boolean()\` — leaf validators
- \`optional(schema)\` — accepts \`undefined\` too
- \`arrayOf(schema)\`
- \`object(shape)\` — an object of validators
- every validator is \`{ parse(value, path?) }\`: returns the value on success,
  throws \`ValidationError\` (exported) on failure

\`ValidationError\` carries \`.path\` — a dotted string like \`'user.tags.1'\` —
and a message \`\`\`\`expected number at user.age, got string\`\`\`\`. Object
validators must reject extra keys, and report the **first** failure they hit in
declaration order.`,
          starter: `export class ValidationError extends Error {
  constructor(message, path) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
  }
}

const leaf = (typeName) => ({
  parse(value, path = '') {
    // TODO
  },
});

export const string = () => leaf('string');
export const number = () => leaf('number');
export const boolean = () => leaf('boolean');

export const optional = (schema) => ({ parse(value, path = '') {} });
export const arrayOf = (schema) => ({ parse(value, path = '') {} });
export const object = (shape) => ({ parse(value, path = '') {} });
`,
          hints: [
            'The `leaf` factory needs to compare `typeof value` with the expected name and throw otherwise. Build the message as `expected ${typeName} at ${path || "value"}, got ${typeof value}`.',
            'Track the path by appending as you descend: for arrays `path ? path + "." + index : String(index)`, for objects `path ? path + "." + key : key`.',
            '`optional` returns the value untouched when it is `undefined`, otherwise delegates to the inner schema with the same path.',
            'For `object`, check `typeof value === "object" && value !== null && !Array.isArray(value)` first, then loop the shape keys in order, then compare `Object.keys(value)` against the shape keys to find extras.',
          ],
          solution: `export class ValidationError extends Error {
  constructor(message, path) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
  }
}

const where = (path) => path || 'value';
const fail = (expected, got, path) => {
  throw new ValidationError('expected ' + expected + ' at ' + where(path) + ', got ' + got, path);
};
const describeValue = (value) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

const leaf = (typeName) => ({
  parse(value, path = '') {
    if (typeof value !== typeName) fail(typeName, describeValue(value), path);
    return value;
  },
});

export const string = () => leaf('string');
export const number = () => leaf('number');
export const boolean = () => leaf('boolean');

export const optional = (schema) => ({
  parse(value, path = '') {
    return value === undefined ? undefined : schema.parse(value, path);
  },
});

export const arrayOf = (schema) => ({
  parse(value, path = '') {
    if (!Array.isArray(value)) fail('array', describeValue(value), path);
    return value.map((item, i) => schema.parse(item, path ? path + '.' + i : String(i)));
  },
});

export const object = (shape) => ({
  parse(value, path = '') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail('object', describeValue(value), path);
    }
    const out = {};
    for (const [key, schema] of Object.entries(shape)) {
      const child = path ? path + '.' + key : key;
      const parsed = schema.parse(value[key], child);
      if (parsed !== undefined || key in value) out[key] = parsed;
    }
    const extra = Object.keys(value).find((k) => !(k in shape));
    if (extra !== undefined) {
      const child = path ? path + '.' + extra : extra;
      throw new ValidationError('unexpected key at ' + child, child);
    }
    return out;
  },
});
`,
          tests: `const { string, number, boolean, optional, arrayOf, object, ValidationError } = solution;

describe('leaf validators', () => {
  it('passes matching values through', () => {
    expect(string().parse('hi')).toBe('hi');
    expect(number().parse(42)).toBe(42);
    expect(boolean().parse(false)).toBe(false);
  });
  it('throws ValidationError with a useful message', () => {
    let caught;
    try { number().parse('42'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught.message).toBe('expected number at value, got string');
  });
  it('reports null distinctly from object', () => {
    let caught;
    try { string().parse(null); } catch (e) { caught = e; }
    expect(caught.message).toContain('got null');
  });
});

describe('object', () => {
  const User = object({ id: number(), name: string() });

  it('parses a valid object', () => {
    expect(User.parse({ id: 1, name: 'ada' })).toEqual({ id: 1, name: 'ada' });
  });
  it('reports the failing key in the path', () => {
    let caught;
    try { User.parse({ id: 1, name: 42 }); } catch (e) { caught = e; }
    expect(caught.message).toBe('expected string at name, got number');
    expect(caught.path).toBe('name');
  });
  it('reports a missing key', () => {
    let caught;
    try { User.parse({ id: 1 }); } catch (e) { caught = e; }
    expect(caught.path).toBe('name');
    expect(caught.message).toContain('got undefined');
  });
  it('rejects a non-object', () => {
    expect(() => User.parse('nope')).toThrow('expected object at value, got string');
    expect(() => User.parse([])).toThrow('got array');
    expect(() => User.parse(null)).toThrow('got null');
  });
  it('rejects extra keys', () => {
    let caught;
    try { User.parse({ id: 1, name: 'ada', isAdmin: true }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught.path).toBe('isAdmin');
  });
  it('reports the first failure in declaration order', () => {
    let caught;
    try { User.parse({ id: 'no', name: 42 }); } catch (e) { caught = e; }
    expect(caught.path).toBe('id');
  });
});

describe('optional', () => {
  const User = object({ id: number(), nickname: optional(string()) });
  it('allows the key to be missing', () => {
    expect(User.parse({ id: 1 })).toEqual({ id: 1 });
  });
  it('still validates a present value', () => {
    expect(User.parse({ id: 1, nickname: 'ada' })).toEqual({ id: 1, nickname: 'ada' });
    expect(() => User.parse({ id: 1, nickname: 9 })).toThrow('expected string at nickname');
  });
});

describe('arrayOf', () => {
  it('validates every element', () => {
    expect(arrayOf(number()).parse([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('reports the failing index', () => {
    let caught;
    try { arrayOf(number()).parse([1, 'two', 3]); } catch (e) { caught = e; }
    expect(caught.path).toBe('1');
    expect(caught.message).toBe('expected number at 1, got string');
  });
  it('rejects a non-array', () => {
    expect(() => arrayOf(number()).parse({})).toThrow('expected array at value, got object');
  });
  it('accepts an empty array', () => {
    expect(arrayOf(string()).parse([])).toEqual([]);
  });
});

describe('nesting', () => {
  const Payload = object({
    user: object({
      id: number(),
      name: string(),
      tags: arrayOf(string()),
    }),
    count: number(),
  });

  it('parses a realistic payload', () => {
    const input = { user: { id: 1, name: 'ada', tags: ['admin', 'beta'] }, count: 2 };
    expect(Payload.parse(input)).toEqual(input);
  });

  it('builds a dotted path through objects and arrays', () => {
    let caught;
    try {
      Payload.parse({ user: { id: 1, name: 'ada', tags: ['ok', 7] }, count: 2 });
    } catch (e) { caught = e; }
    expect(caught.path).toBe('user.tags.1');
    expect(caught.message).toBe('expected string at user.tags.1, got number');
  });

  it('reports a deep missing field', () => {
    let caught;
    try { Payload.parse({ user: { id: 1, tags: [] }, count: 2 }); } catch (e) { caught = e; }
    expect(caught.path).toBe('user.name');
  });
});`,
        },
        {
          id: 'ts-result',
          title: 'Result instead of throw',
          kind: 'ts',
          xp: 85,
          why: 'Makes failure part of the signature, so callers cannot forget it. The pattern behind Rust, Go, and every serious error-handling RFC.',
          tags: ['errors', 'unions', 'functional'],
          brief: `A thrown error is invisible in a type signature. \`Result\` puts failure in
the return type, so the compiler makes you deal with it.

## Task

Export:

- \`ok(value)\` — \`{ ok: true, value }\`
- \`err(error)\` — \`{ ok: false, error }\`
- \`attempt(fn)\` — run \`fn\`, returning a Result instead of throwing
- \`attemptAsync(fn)\` — the async version
- \`map(result, fn)\` — transform the value, pass errors through untouched
- \`mapError(result, fn)\`
- \`unwrapOr(result, fallback)\`
- \`unwrap(result)\` — returns the value or **throws** the error
- \`all(results)\` — an array of Results becomes a Result of an array,
  short-circuiting on the first error

\`map\` must not swallow a throw from \`fn\`: if \`fn\` throws, the throw
propagates (use \`attempt\` if you want it captured).`,
          starter: `export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });

export function attempt(fn) {
  // TODO
}

export async function attemptAsync(fn) {
  // TODO
}

export function map(result, fn) {
  // TODO
}

export function mapError(result, fn) {
  // TODO
}

export function unwrapOr(result, fallback) {
  // TODO
}

export function unwrap(result) {
  // TODO
}

export function all(results) {
  // TODO
}
`,
          hints: [
            '`attempt` is a try/catch returning `ok(fn())` or `err(caught)`.',
            '`map` should check `result.ok` and return `ok(fn(result.value))`, otherwise return the original result object unchanged.',
            '`all` can use a plain loop: on the first `!r.ok`, return that result immediately; otherwise collect values and return `ok(values)`.',
            '`unwrap` throws `result.error` directly — do not wrap it in a new Error, or you lose the type the caller wanted to branch on.',
          ],
          solution: `export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });

export function attempt(fn) {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}

export async function attemptAsync(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error);
  }
}

export function map(result, fn) {
  // A throw inside fn is the caller's problem; wrap with attempt to capture it.
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapError(result, fn) {
  return result.ok ? result : err(fn(result.error));
}

export function unwrapOr(result, fallback) {
  return result.ok ? result.value : fallback;
}

export function unwrap(result) {
  if (result.ok) return result.value;
  throw result.error;
}

export function all(results) {
  const values = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}
`,
          tests: `const { ok, err, attempt, attemptAsync, map, mapError, unwrapOr, unwrap, all } = solution;

describe('constructors', () => {
  it('builds ok and err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
});

describe('attempt', () => {
  it('captures a return value', () => {
    expect(attempt(() => 6 * 7)).toEqual({ ok: true, value: 42 });
  });
  it('captures a throw instead of propagating it', () => {
    const r = attempt(() => { throw new TypeError('nope'); });
    expect(r.ok).toBe(false);
    expect(r.error).toBeInstanceOf(TypeError);
    expect(r.error.message).toBe('nope');
  });
  it('handles JSON.parse, the classic case', () => {
    expect(attempt(() => JSON.parse('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
    expect(attempt(() => JSON.parse('not json')).ok).toBe(false);
  });
});

describe('attemptAsync', () => {
  it('captures a resolved value', async () => {
    expect(await attemptAsync(async () => 'done')).toEqual({ ok: true, value: 'done' });
  });
  it('captures a rejection', async () => {
    const r = await attemptAsync(async () => { throw new Error('offline'); });
    expect(r.ok).toBe(false);
    expect(r.error.message).toBe('offline');
  });
  it('never rejects', async () => {
    await attemptAsync(async () => { throw new Error('x'); });
  });
});

describe('map', () => {
  it('transforms a value', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual({ ok: true, value: 20 });
  });
  it('passes an error through untouched', () => {
    const failure = err(new Error('keep me'));
    const out = map(failure, () => 'never runs');
    expect(out).toBe(failure);
  });
  it('does not swallow a throw from the mapper', () => {
    expect(() => map(ok(1), () => { throw new Error('mapper blew up'); })).toThrow('mapper blew up');
  });
  it('chains', () => {
    const out = map(map(ok(2), (n) => n + 1), (n) => 'n=' + n);
    expect(out).toEqual({ ok: true, value: 'n=3' });
  });
});

describe('mapError', () => {
  it('transforms an error', () => {
    const out = mapError(err(new Error('raw')), (e) => 'wrapped: ' + e.message);
    expect(out).toEqual({ ok: false, error: 'wrapped: raw' });
  });
  it('leaves a success alone', () => {
    const success = ok(1);
    expect(mapError(success, () => 'x')).toBe(success);
  });
});

describe('unwrapOr / unwrap', () => {
  it('unwrapOr returns the value or the fallback', () => {
    expect(unwrapOr(ok('real'), 'fallback')).toBe('real');
    expect(unwrapOr(err(new Error('x')), 'fallback')).toBe('fallback');
  });
  it('unwrap returns the value', () => {
    expect(unwrap(ok(5))).toBe(5);
  });
  it('unwrap throws the original error object', () => {
    const original = new RangeError('out of range');
    let caught;
    try { unwrap(err(original)); } catch (e) { caught = e; }
    expect(caught).toBe(original);
  });
});

describe('all', () => {
  it('collects every value', () => {
    expect(all([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] });
  });
  it('short-circuits on the first error', () => {
    const first = err('first');
    const out = all([ok(1), first, err('second')]);
    expect(out).toBe(first);
  });
  it('handles an empty list', () => {
    expect(all([])).toEqual({ ok: true, value: [] });
  });
  it('composes with attempt for a whole batch', () => {
    const parsed = all(['1', '2', 'oops'].map((raw) => attempt(() => {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error('not a number: ' + raw);
      return n;
    })));
    expect(parsed.ok).toBe(false);
    expect(parsed.error.message).toBe('not a number: oops');
  });
});`,
        },
        {
          id: 'ts-typed-client',
          title: 'A typed API surface',
          kind: 'typecheck',
          xp: 90,
          why: 'One route map, and every call site knows its params and response. This is what "typed end to end" actually means.',
          tags: ['generics', 'template literals', 'api design'],
          brief: `Typing a client route by route is busywork that rots. Instead declare a
route map once and derive everything from it.

## Task

Given the \`Routes\` map in the starter, export:

- \`Endpoint\` — the union of route keys
- \`ResponseOf<E>\` — the response type for an endpoint
- \`BodyOf<E>\` — the request body type, or \`never\` if the route has none
- \`ApiClient\` — an interface with:
  - \`get<E extends GetEndpoint>(endpoint: E): Promise<ResponseOf<E>>\`
  - \`post<E extends PostEndpoint>(endpoint: E, body: BodyOf<E>): Promise<ResponseOf<E>>\`
- \`GetEndpoint\` / \`PostEndpoint\` — endpoints filtered by method

The spec proves that calling \`get('/users')\` gives \`User[]\`, that posting the
wrong body shape fails, and that a GET route cannot be posted to.`,
          starter: `export interface User {
  id: number;
  name: string;
}

export interface Routes {
  '/users': { method: 'GET'; response: User[] };
  '/users/:id': { method: 'GET'; response: User };
  '/users/create': { method: 'POST'; body: { name: string }; response: User };
  '/sessions': { method: 'POST'; body: { email: string; password: string }; response: { token: string } };
}

export type Endpoint = string;              // TODO
export type ResponseOf<E> = unknown;        // TODO
export type BodyOf<E> = unknown;            // TODO
export type GetEndpoint = string;           // TODO
export type PostEndpoint = string;          // TODO

export interface ApiClient {
  // TODO
}
`,
          hints: [
            '`export type Endpoint = keyof Routes;` then `ResponseOf<E extends Endpoint> = Routes[E]["response"]`.',
            'To filter by method, use the "map to key or never, then index" trick: `{ [K in Endpoint]: Routes[K]["method"] extends "GET" ? K : never }[Endpoint]`.',
            'For `BodyOf`, check whether the route type has a `body` key: `Routes[E] extends { body: infer B } ? B : never`.',
            'The client methods need their own type parameters so the return type depends on the argument: `get<E extends GetEndpoint>(endpoint: E): Promise<ResponseOf<E>>`.',
          ],
          solution: `export interface User {
  id: number;
  name: string;
}

export interface Routes {
  '/users': { method: 'GET'; response: User[] };
  '/users/:id': { method: 'GET'; response: User };
  '/users/create': { method: 'POST'; body: { name: string }; response: User };
  '/sessions': { method: 'POST'; body: { email: string; password: string }; response: { token: string } };
}

export type Endpoint = keyof Routes;

export type ResponseOf<E extends Endpoint> = Routes[E]['response'];

export type BodyOf<E extends Endpoint> = Routes[E] extends { body: infer B } ? B : never;

export type GetEndpoint = {
  [K in Endpoint]: Routes[K]['method'] extends 'GET' ? K : never;
}[Endpoint];

export type PostEndpoint = {
  [K in Endpoint]: Routes[K]['method'] extends 'POST' ? K : never;
}[Endpoint];

export interface ApiClient {
  get<E extends GetEndpoint>(endpoint: E): Promise<ResponseOf<E>>;
  post<E extends PostEndpoint>(endpoint: E, body: BodyOf<E>): Promise<ResponseOf<E>>;
}
`,
          tests: `import type {
  ApiClient, Endpoint, ResponseOf, BodyOf, GetEndpoint, PostEndpoint, User,
} from './solution';

type _endpoints = Expect<Equal<Endpoint, '/users' | '/users/:id' | '/users/create' | '/sessions'>>;
type _gets = Expect<Equal<GetEndpoint, '/users' | '/users/:id'>>;
type _posts = Expect<Equal<PostEndpoint, '/users/create' | '/sessions'>>;

type _resList = Expect<Equal<ResponseOf<'/users'>, User[]>>;
type _resOne = Expect<Equal<ResponseOf<'/users/:id'>, User>>;
type _resToken = Expect<Equal<ResponseOf<'/sessions'>, { token: string }>>;

type _bodyCreate = Expect<Equal<BodyOf<'/users/create'>, { name: string }>>;
type _bodyNone = Expect<Equal<BodyOf<'/users'>, never>>;

declare const api: ApiClient;

async function useIt() {
  // The response type follows from the endpoint string.
  const users = await api.get('/users');
  type _u = Expect<Equal<typeof users, User[]>>;
  const name: string = users[0].name;

  const one = await api.get('/users/:id');
  type _o = Expect<Equal<typeof one, User>>;

  const session = await api.post('/sessions', { email: 'a@b.c', password: 'hunter2' });
  type _s = Expect<Equal<typeof session, { token: string }>>;

  const created = await api.post('/users/create', { name: 'ada' });
  type _c = Expect<Equal<typeof created, User>>;

  // @ts-expect-error /users is a GET route
  await api.post('/users', { name: 'ada' });
  // @ts-expect-error /sessions is a POST route
  await api.get('/sessions');
  // @ts-expect-error no such endpoint
  await api.get('/unknown');
  // @ts-expect-error wrong body shape
  await api.post('/users/create', { nickname: 'ada' });
  // @ts-expect-error missing required body field
  await api.post('/sessions', { email: 'a@b.c' });
  // @ts-expect-error body is required
  await api.post('/users/create');
}
`,
        },
        {
          id: 'ts-typed-emitter',
          title: 'BOSS: a fully typed EventEmitter',
          kind: 'typecheck',
          xp: 210,
          boss: true,
          why: 'This is the type-level exercise that separates "I use TypeScript" from "I can design an API in TypeScript".',
          tags: ['generics', 'variadic tuples', 'api design'],
          brief: `You built an \`Emitter\` in the JavaScript track. Now make it impossible to
misuse: wrong event name, wrong payload, wrong handler arity — all compile
errors.

## Task

Export:

\`\`\`ts
type Events = {
  connected: [];
  message: [text: string, from: string];
  error: [error: Error];
};
declare const bus: TypedEmitter<Events>;

bus.emit('message', 'hi', 'ada');   // ok
bus.emit('message', 'hi');          // error: missing argument
bus.emit('connected');              // ok
bus.on('error', (e) => e.message);  // e is inferred as Error
\`\`\`

Export a generic \`interface TypedEmitter<E extends EventMap>\` with:

- \`on<K extends keyof E>(event: K, handler: (...args: E[K]) => void): () => void\`
- \`once\` — same signature
- \`off\` — same
- \`emit<K extends keyof E>(event: K, ...args: E[K]): number\`
- \`listenerCount(event: keyof E): number\`
- \`eventNames(): (keyof E)[]\`

Also export:

- \`EventMap\` — the constraint: an object whose values are argument tuples
- \`HandlerOf<E, K>\` — the handler type for one event
- \`PayloadOf<E, K>\` — the argument tuple for one event
- \`EventsWithoutPayload<E>\` — the union of event names whose tuple is empty
  (the ones you can emit with no arguments)

The variadic \`...args: E[K]\` is the crux: it makes arity and each argument's
type follow from the event name.`,
          starter: `export type EventMap = Record<string, unknown[]>;

export type PayloadOf<E extends EventMap, K extends keyof E> = unknown;   // TODO
export type HandlerOf<E extends EventMap, K extends keyof E> = unknown;   // TODO
export type EventsWithoutPayload<E extends EventMap> = keyof E;           // TODO

export interface TypedEmitter<E extends EventMap> {
  // TODO
}
`,
          hints: [
            '`PayloadOf` is just `E[K]`, and `HandlerOf` is `(...args: E[K]) => void`. The power comes from spreading a tuple type into a parameter list.',
            'For `emit`, the signature is `emit<K extends keyof E>(event: K, ...args: E[K]): number`. Because `E[K]` is a tuple, the compiler checks both arity and each position.',
            'Tuples can carry labels (`[text: string, from: string]`), which show up in editor hints — worth doing in the Events map, but not required for the types to work.',
            'For `EventsWithoutPayload`, map to the key when the tuple is assignable to `[]`: `{ [K in keyof E]: E[K] extends [] ? K : never }[keyof E]`.',
            'Return `() => void` from `on` and `once` so callers get an unsubscribe function, matching the JavaScript version you already built.',
          ],
          solution: `export type EventMap = Record<string, unknown[]>;

export type PayloadOf<E extends EventMap, K extends keyof E> = E[K];

// Spreading the tuple into the parameter list is what fixes arity and types.
export type HandlerOf<E extends EventMap, K extends keyof E> = (...args: E[K]) => void;

export type EventsWithoutPayload<E extends EventMap> = {
  [K in keyof E]: E[K] extends [] ? K : never;
}[keyof E];

export interface TypedEmitter<E extends EventMap> {
  on<K extends keyof E>(event: K, handler: HandlerOf<E, K>): () => void;
  once<K extends keyof E>(event: K, handler: HandlerOf<E, K>): () => void;
  off<K extends keyof E>(event: K, handler: HandlerOf<E, K>): this;
  emit<K extends keyof E>(event: K, ...args: PayloadOf<E, K>): number;
  listenerCount(event: keyof E): number;
  eventNames(): (keyof E)[];
}
`,
          tests: `import type {
  TypedEmitter, EventMap, PayloadOf, HandlerOf, EventsWithoutPayload,
} from './solution';

type Events = {
  connected: [];
  message: [text: string, from: string];
  error: [error: Error];
  progress: [percent: number];
};

declare const bus: TypedEmitter<Events>;

type _payload = Expect<Equal<PayloadOf<Events, 'message'>, [text: string, from: string]>>;
type _handler = Expect<Equal<HandlerOf<Events, 'error'>, (error: Error) => void>>;
type _empty = Expect<Equal<EventsWithoutPayload<Events>, 'connected'>>;
type _mapOk = Expect<Equal<Events extends EventMap ? true : false, true>>;

// --- emit: arity and argument types both follow from the event name
const n: number = bus.emit('message', 'hi', 'ada');
bus.emit('connected');
bus.emit('error', new Error('boom'));
bus.emit('progress', 50);

// @ts-expect-error missing the second argument
bus.emit('message', 'hi');
// @ts-expect-error too many arguments
bus.emit('connected', 'extra');
// @ts-expect-error wrong argument type
bus.emit('progress', '50');
// @ts-expect-error wrong payload type
bus.emit('error', 'boom');
// @ts-expect-error unknown event
bus.emit('exploded');

// --- on: the handler's parameters are inferred, no annotations needed
const stop = bus.on('message', (text, from) => {
  const a: string = text;
  const b: string = from;
});
type _stop = Expect<Equal<typeof stop, () => void>>;

bus.on('error', (error) => {
  const msg: string = error.message;
});
bus.on('connected', () => {});
// A handler may ignore trailing arguments, exactly like a normal callback.
bus.on('message', (text) => text.toUpperCase());

// @ts-expect-error the payload is a string, not a number
bus.on('message', (text: number) => {});
// @ts-expect-error handler declares more parameters than the event provides
bus.on('progress', (percent: number, extra: string) => {});
// @ts-expect-error unknown event
bus.on('exploded', () => {});

// --- once and off mirror on
const stopOnce: () => void = bus.once('connected', () => {});
const handler = (error: Error) => {};
bus.off('error', handler);
// @ts-expect-error handler does not match the event's payload
bus.off('error', (n: number) => {});

// --- the odds and ends
const count: number = bus.listenerCount('message');
// @ts-expect-error not an event of this emitter
bus.listenerCount('nope');
const names = bus.eventNames();
type _names = Expect<Equal<typeof names, (keyof Events)[]>>;

// --- it is generic over any event map, not hardcoded to Events
type Other = { ping: [] };
declare const other: TypedEmitter<Other>;
other.emit('ping');
// @ts-expect-error not an event of this emitter
other.emit('message', 'a', 'b');
`,
        },
      ],
    },
  ],
});
