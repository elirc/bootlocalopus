import { createForm } from './solution';
import type { FieldPath, FieldValue, FormErrors } from './solution';

interface Checkout {
  email: string;
  coupon: string | null;
  customer: { name: string; address: { city: string; postcode: string } };
  items: { sku: string; qty: number; giftWrap: boolean }[];
  tags: string[];
  deliverOn: Date;
}

// ---------- FieldPath ----------
type _paths = Expect<Equal<FieldPath<Checkout>,
  | 'email'
  | 'coupon'
  | 'customer' | 'customer.name' | 'customer.address' | 'customer.address.city' | 'customer.address.postcode'
  | 'items' | `items.${number}` | `items.${number}.sku` | `items.${number}.qty` | `items.${number}.giftWrap`
  | 'tags' | `tags.${number}`
  | 'deliverOn'
>>;
type _flat = Expect<Equal<FieldPath<{ a: number }>, 'a'>>;
type _leaf = Expect<Equal<FieldPath<string>, never>>;

// ---------- FieldValue ----------
type _v1 = Expect<Equal<FieldValue<Checkout, 'customer.address.city'>, string>>;
type _v2 = Expect<Equal<FieldValue<Checkout, 'coupon'>, string | null>>;
type _v3 = Expect<Equal<FieldValue<Checkout, 'items.0'>, { sku: string; qty: number; giftWrap: boolean }>>;
type _v4 = Expect<Equal<FieldValue<Checkout, 'items.3.qty'>, number>>;
type _v5 = Expect<Equal<FieldValue<Checkout, 'tags.1'>, string>>;
type _v6 = Expect<Equal<FieldValue<Checkout, 'deliverOn'>, Date>>;
type _v7 = Expect<Equal<FieldValue<Checkout, 'items'>, { sku: string; qty: number; giftWrap: boolean }[]>>;
type _v8 = Expect<Equal<FieldValue<Checkout, 'items.first.qty'>, never>>;

// ---------- FormErrors ----------
type _e = Expect<Equal<FormErrors<Checkout>, {
  email?: string;
  coupon?: string;
  customer?: { name?: string; address?: { city?: string; postcode?: string } };
  items?: ({ sku?: string; qty?: string; giftWrap?: string } | undefined)[];
  tags?: (string | undefined)[];
  deliverOn?: string;
}>>;

// ---------- the form ----------
declare const initial: Checkout;
const form = createForm(initial);

const city = form.get('customer.address.city');
type _g1 = Expect<Equal<typeof city, string>>;
const qty = form.get('items.2.qty');
type _g2 = Expect<Equal<typeof qty, number>>;

form.set('items.0.qty', 3);
form.set('coupon', null);
form.set('deliverOn', new Date());
form.set('tags', ['gift']);
// @ts-expect-error qty is a number
form.set('items.0.qty', '3');
// @ts-expect-error a typo in a path
form.set('customer.adress.city', 'Leeds');
// @ts-expect-error arrays are indexed by number
form.set('items.first.qty', 1);
// @ts-expect-error a Date is a field, not a group
form.get('deliverOn.getTime');
// @ts-expect-error an object field needs an object
form.set('customer.address', 'Leeds');

const [watchedCity, watchedQty, watchedCoupon] = form.watch('customer.address.city', 'items.0.qty', 'coupon');
type _w1 = Expect<Equal<typeof watchedCity, string>>;
type _w2 = Expect<Equal<typeof watchedQty, number>>;
type _w3 = Expect<Equal<typeof watchedCoupon, string | null>>;
const watchedNone = form.watch();
type _w4 = Expect<Equal<typeof watchedNone, []>>;
// @ts-expect-error every watched path is checked
form.watch('email', 'emial');

form.setError('items.1.qty', 'Out of stock');
const qtyError = form.errors.items?.[1]?.qty;
type _err1 = Expect<Equal<typeof qtyError, string | undefined>>;
// @ts-expect-error errors are optional at every level: check before you read
form.errors.customer.name;
// @ts-expect-error setError checks the path too
form.setError('customer.nmae', 'Required');
