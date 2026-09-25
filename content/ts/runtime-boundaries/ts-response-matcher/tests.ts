import { match, matchOr, isStatus } from './solution';
import type { ResponseFor, Handlers } from './solution';

interface Order { id: string; totalCents: number }
type FieldError = { field: string; message: string };

type CreateOrderResponse =
  | { status: 201; body: Order; location: string }
  | { status: 400; body: { message: string } }
  | { status: 409; body: { message: string; existingId: string } }
  | { status: 422; body: { errors: FieldError[] } };

declare const res: CreateOrderResponse;

// ---------- ResponseFor ----------
type _r1 = Expect<Equal<ResponseFor<CreateOrderResponse, 201>, { status: 201; body: Order; location: string }>>;
type _r2 = Expect<Equal<ResponseFor<CreateOrderResponse, 400 | 409>['status'], 400 | 409>>;
// @ts-expect-error 404 is not a status this endpoint returns
type _r3 = ResponseFor<CreateOrderResponse, 404>;

// ---------- Handlers ----------
type H = Handlers<CreateOrderResponse, string>;
type _h1 = Expect<Equal<keyof H, 201 | 400 | 409 | 422>>;
type _h2 = Expect<Equal<Parameters<H[409]>[0], { status: 409; body: { message: string; existingId: string } }>>;
type _h3 = Expect<Equal<ReturnType<H[201]>, string>>;

// ---------- match ----------
const message = match(res, {
  201: (r) => `Created ${r.body.id} at ${r.location}`,
  400: (r) => r.body.message,
  409: (r) => `Already exists as ${r.body.existingId}`,
  422: (r) => r.body.errors.map((e) => e.field).join(', '),
});
type _m1 = Expect<Equal<typeof message, string>>;

const code = match(res, {
  201: () => 0,
  400: () => 1,
  409: () => 2,
  422: () => 3,
});
type _m2 = Expect<Equal<typeof code, number>>;

// @ts-expect-error every status needs a handler: 422 is missing
match(res, { 201: () => 'a', 400: () => 'b', 409: () => 'c' });

const mixed = match(res, {
  201: (r) => r.body,
  400: () => null,
  409: () => null,
  422: () => null,
});
type _m3 = Expect<Equal<typeof mixed, Order | null>>;

match(res, {
  // @ts-expect-error each handler sees only its own response
  201: (r) => r.body.existingId,
  400: () => '',
  409: () => '',
  422: () => '',
});

// ---------- matchOr ----------
const summary = matchOr(
  res,
  { 201: (r) => `ok ${r.body.id}` },
  (r) => {
    type _fallback = Expect<Equal<typeof r['status'], 400 | 409 | 422>>;
    return `failed with ${r.status}`;
  },
);
type _o1 = Expect<Equal<typeof summary, string>>;

matchOr(res, { 201: () => 1, 422: () => 2 }, (r) => {
  type _rest = Expect<Equal<typeof r['status'], 400 | 409>>;
  return 3;
});

matchOr(res, {}, (r) => {
  type _all = Expect<Equal<typeof r, CreateOrderResponse>>;
  return null;
});

// @ts-expect-error handlers still only take real statuses
matchOr(res, { 500: () => 1 }, () => 2);

// ---------- isStatus ----------
if (isStatus(res, 400, 409)) {
  type _i1 = Expect<Equal<typeof res['status'], 400 | 409>>;
  const m: string = res.body.message;
} else {
  type _i2 = Expect<Equal<typeof res['status'], 201 | 422>>;
}
if (isStatus(res, 201)) {
  const where: string = res.location;
}
// @ts-expect-error 418 is not one of this response's statuses
isStatus(res, 418);
