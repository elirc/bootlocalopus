import type { DeepPartial, DeepReadonly, DeepRequired } from './solution';

interface Config {
  server: { host: string; port: number; tls?: { cert: string; key: string } };
  db: { url: string; pool: { min: number; max: number } };
  features: string[];
  retries: number;
  startedAt: Date;
  onError: (e: Error) => void;
}

// ---------------- DeepPartial ----------------
type _partial = Expect<Equal<DeepPartial<Config>, {
  server?: { host?: string; port?: number; tls?: { cert?: string; key?: string } };
  db?: { url?: string; pool?: { min?: number; max?: number } };
  features?: string[];
  retries?: number;
  startedAt?: Date;
  onError?: (e: Error) => void;
}>>;
type _pPrim = Expect<Equal<DeepPartial<string>, string>>;
type _pUnion = Expect<Equal<DeepPartial<{ a: { b: 1 } } | null>, { a?: { b?: 1 } } | null>>;

const o1: DeepPartial<Config> = {};
const o2: DeepPartial<Config> = { server: { port: 8080 } };
const o3: DeepPartial<Config> = { db: { pool: { max: 20 } }, features: ['beta'] };
// @ts-expect-error wrong type for a nested key
const b1: DeepPartial<Config> = { server: { port: '8080' } };
// @ts-expect-error a typo in a nested key is still caught
const b2: DeepPartial<Config> = { server: { hots: 'example.com' } };
// @ts-expect-error arrays are replaced whole, so their elements are not partial
const b3: DeepPartial<Config> = { features: [undefined] };
// @ts-expect-error a Date is not mapped into an object of optional methods
const b4: DeepPartial<Config> = { startedAt: {} };
declare const p: DeepPartial<Config>;
p.onError?.(new Error('still callable'));

// ---------------- DeepReadonly ----------------
declare const frozen: DeepReadonly<Config>;
type _rDate = Expect<Equal<DeepReadonly<Config>['startedAt'], Date>>;
type _rFn = Expect<Equal<DeepReadonly<Config>['onError'], (e: Error) => void>>;
type _rArr = Expect<Equal<DeepReadonly<Config>['features'], readonly string[]>>;
type _rArrObj = Expect<Equal<DeepReadonly<{ xs: { id: number }[] }>, { readonly xs: readonly { readonly id: number }[] }>>;
type _rTuple = Expect<Equal<DeepReadonly<[number, { a: string }]>, readonly [number, { readonly a: string }]>>;
type _rOpt = Expect<Equal<DeepReadonly<Config>['server']['tls'], { readonly cert: string; readonly key: string } | undefined>>;
const port: number = frozen.server.port;
frozen.onError(new Error('boom'));
const t: number = frozen.startedAt.getTime();
// @ts-expect-error nested write
frozen.db.pool.max = 1;
// @ts-expect-error top-level write
frozen.retries = 3;
// @ts-expect-error arrays are readonly too
frozen.features.push('x');

// ---------------- DeepRequired ----------------
type _req = Expect<Equal<DeepRequired<Config>['server'], { host: string; port: number; tls: { cert: string; key: string } }>>;
type _reqDeep = Expect<Equal<
  DeepRequired<{ a?: { b?: { c?: number } } }>,
  { a: { b: { c: number } } }
>>;
type _reqFn = Expect<Equal<DeepRequired<{ cb?: () => void }>, { cb: () => void }>>;
type _reqDate = Expect<Equal<DeepRequired<{ at?: Date }>, { at: Date }>>;
