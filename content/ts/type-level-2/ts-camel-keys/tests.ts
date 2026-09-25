import type { CamelCase, SnakeCase, CamelKeys, SnakeKeys } from './solution';

type _c1 = Expect<Equal<CamelCase<'user_id'>, 'userId'>>;
type _c2 = Expect<Equal<CamelCase<'unit_price_cents'>, 'unitPriceCents'>>;
type _c3 = Expect<Equal<CamelCase<'email'>, 'email'>>;
type _c4 = Expect<Equal<CamelCase<'alreadyCamel'>, 'alreadyCamel'>>;
type _c5 = Expect<Equal<CamelCase<'address_line_2'>, 'addressLine2'>>;
type _c6 = Expect<Equal<CamelCase<'a_b'>, 'aB'>>;

type _s1 = Expect<Equal<SnakeCase<'userId'>, 'user_id'>>;
type _s2 = Expect<Equal<SnakeCase<'unitPriceCents'>, 'unit_price_cents'>>;
type _s3 = Expect<Equal<SnakeCase<'email'>, 'email'>>;
type _s4 = Expect<Equal<SnakeCase<'addressLine2'>, 'address_line2'>>;
type _s5 = Expect<Equal<SnakeCase<'already_snake'>, 'already_snake'>>;

interface OrderRow {
  order_id: number;
  customer_email: string;
  created_at: Date;
  status: 'open' | 'paid';
  line_items: { sku_code: string; unit_price_cents: number }[];
  shipping_address: { postal_code: string; country_code: string } | null;
  metadata?: { source_system: string };
  tag_names: readonly string[];
}

type Order = CamelKeys<OrderRow>;
type _order = Expect<Equal<Order, {
  orderId: number;
  customerEmail: string;
  createdAt: Date;
  status: 'open' | 'paid';
  lineItems: { skuCode: string; unitPriceCents: number }[];
  shippingAddress: { postalCode: string; countryCode: string } | null;
  metadata?: { sourceSystem: string };
  tagNames: readonly string[];
}>>;

type _roundTrip = Expect<Equal<SnakeKeys<Order>, {
  order_id: number;
  customer_email: string;
  created_at: Date;
  status: 'open' | 'paid';
  line_items: { sku_code: string; unit_price_cents: number }[];
  shipping_address: { postal_code: string; country_code: string } | null;
  metadata?: { source_system: string };
  tag_names: readonly string[];
}>>;

type _prim = Expect<Equal<CamelKeys<string>, string>>;
type _arrTop = Expect<Equal<CamelKeys<{ a_b: number }[]>, { aB: number }[]>>;
type _fn = Expect<Equal<CamelKeys<{ on_save: (row: OrderRow) => void }>, { onSave: (row: OrderRow) => void }>>;
type _union = Expect<Equal<CamelKeys<{ kind_of: 'a' } | { kind_of: 'b'; extra_field: 1 }>, { kindOf: 'a' } | { kindOf: 'b'; extraField: 1 }>>;
type _num = Expect<Equal<CamelKeys<{ 0: { a_b: 1 } }>, { 0: { aB: 1 } }>>;

declare const row: Order;
const d: Date = row.createdAt;
const n: number = row.lineItems[0].unitPriceCents;
// @ts-expect-error the snake_case key is gone
row.order_id;
