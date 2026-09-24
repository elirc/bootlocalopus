import { string, number, optional, arrayOf, object } from './solution';
import type { Infer, Schema } from './solution';

const User = object({
  id: number(),
  nickname: optional(string()),
  tags: arrayOf(string()),
});

// The headline: the type falls out of the schema, with `?:` for optional keys.
type _user = Expect<Equal<Infer<typeof User>, { id: number; nickname?: string; tags: string[] }>>;
type _notAny = ExpectFalse<IsAny<Infer<typeof User>>>;
type _idNotAny = ExpectFalse<IsAny<Infer<typeof User>['id']>>;

// Leaves and wrappers.
type _string = Expect<Equal<Infer<ReturnType<typeof string>>, string>>;
type _number = Expect<Equal<Infer<ReturnType<typeof number>>, number>>;
const maybeName = optional(string());
type _optional = Expect<Equal<Infer<typeof maybeName>, string | undefined>>;
const matrix = arrayOf(arrayOf(number()));
type _nestedArray = Expect<Equal<Infer<typeof matrix>, number[][]>>;

// Nesting: objects in objects, arrays of objects, optional objects.
const Order = object({
  id: string(),
  customer: object({ id: number(), email: string() }),
  lines: arrayOf(object({ sku: string(), qty: number(), note: optional(string()) })),
  coupon: optional(object({ code: string() })),
});
type _order = Expect<Equal<Infer<typeof Order>, {
  id: string;
  customer: { id: number; email: string };
  lines: { sku: string; qty: number; note?: string }[];
  coupon?: { code: string };
}>>;

// A shape with only optional keys, and an empty shape.
const Prefs = object({ theme: optional(string()), fontSize: optional(number()) });
type _prefs = Expect<Equal<Infer<typeof Prefs>, { theme?: string; fontSize?: number }>>;
const Empty = object({});
type _empty = Expect<Equal<Infer<typeof Empty>, {}>>;

// parse() returns the inferred type, so validated data is typed data.
declare const body: unknown;
const parsed = User.parse(body);
type _parsed = Expect<Equal<typeof parsed, Infer<typeof User>>>;
const ok: Infer<typeof User> = { id: 1, tags: [] };
const okFull: Infer<typeof User> = { id: 1, nickname: 'ada', tags: ['admin'] };

// Every builder is a Schema.
const asSchema: Schema<{ id: number; nickname?: string; tags: string[] }> = User;

// And the wrong things do not compile.
// @ts-expect-error id must be a number
const badId: Infer<typeof User> = { id: '1', tags: [] };
// @ts-expect-error tags is required
const missingTags: Infer<typeof User> = { id: 1 };
// @ts-expect-error nickname is a string when present
const badNick: Infer<typeof User> = { id: 1, tags: [], nickname: 7 };
// @ts-expect-error a shape value must be a schema, not a value
object({ id: 5 });
// @ts-expect-error pass a schema, not the factory
arrayOf(string);
// @ts-expect-error optional() wraps a schema
optional('nickname');
// @ts-expect-error unknown keys are not part of the type
parsed.email;
