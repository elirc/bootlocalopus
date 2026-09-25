import { deepFreeze, totalQty, addLine } from './solution';
import type { Immutable, Cart, Line } from './solution';

interface Settings {
  theme: 'light' | 'dark';
  tags: string[];
  limits: { perPage: number; nested: { depth: number[] } };
  owners: Map<string, { email: string }>;
  flags: Set<string>;
  createdAt: Date;
  onChange: (value: string) => void;
  point: [number, number];
  maybe?: { note: string } | null;
}
type Frozen = Immutable<Settings>;

// --- every level is read-only, with the right read-only interface
type _theme = Expect<Equal<Frozen['theme'], 'light' | 'dark'>>;
type _tags = Expect<Equal<Frozen['tags'], readonly string[]>>;
type _limits = Expect<Equal<Frozen['limits'], { readonly perPage: number; readonly nested: { readonly depth: readonly number[] } }>>;
type _owners = Expect<Equal<Frozen['owners'], ReadonlyMap<string, { readonly email: string }>>>;
type _flags = Expect<Equal<Frozen['flags'], ReadonlySet<string>>>;
type _point = Expect<Equal<Frozen['point'], readonly [number, number]>>;
type _maybe = Expect<Equal<Frozen['maybe'], { readonly note: string } | null | undefined>>;
// Functions and Dates pass through untouched.
type _fn = Expect<Equal<Frozen['onChange'], (value: string) => void>>;
type _date = Expect<Equal<Frozen['createdAt'], Date>>;
// Primitives and unions.
type _prim = Expect<Equal<Immutable<string>, string>>;
type _union = Expect<Equal<Immutable<string[] | null>, readonly string[] | null>>;
type _arrOfObj = Expect<Equal<Immutable<{ a: number }[]>, readonly { readonly a: number }[]>>;

declare const settings: Frozen;
// @ts-expect-error top-level property
settings.theme = 'dark';
// @ts-expect-error arrays lose their mutators
settings.tags.push('x');
// @ts-expect-error nested objects
settings.limits.perPage = 50;
// @ts-expect-error deeply nested arrays
settings.limits.nested.depth[0] = 1;
// @ts-expect-error maps lose set/delete
settings.owners.set('a', { email: 'a@x.io' });
// @ts-expect-error and their values are read-only too
settings.owners.get('a')!.email = 'b@x.io';
// @ts-expect-error sets lose add
settings.flags.add('beta');
// @ts-expect-error tuples too
settings.point[0] = 1;
// Reading is unaffected.
const perPage: number = settings.limits.perPage;
const owner: { readonly email: string } | undefined = settings.owners.get('a');
settings.onChange('x');

// --- deepFreeze returns the frozen type
const config = deepFreeze({ retries: [100, 200], db: { url: 'postgres://x' } });
type _config = Expect<Equal<typeof config, Immutable<{ retries: number[]; db: { url: string } }>>>;
// @ts-expect-error frozen
config.db.url = 'y';

// --- read-only inputs accept frozen and mutable values; outputs are new values
declare const mutableLines: Line[];
declare const frozenCart: Immutable<Cart>;
const a: number = totalQty(mutableLines);
const b: number = totalQty(frozenCart.lines);
const next = addLine(frozenCart, { sku: 's1', qty: 2 });
type _next = Expect<Equal<typeof next, Immutable<Cart>>>;
declare const plainCart: Cart;
addLine(plainCart, { sku: 's2', qty: 1 });
// @ts-expect-error the result is read-only as well
next.lines.push({ sku: 's3', qty: 1 });
