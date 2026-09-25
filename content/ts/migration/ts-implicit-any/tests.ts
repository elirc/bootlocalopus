import { formatMoney, sumBy, groupBy, pick, once } from './solution';
import type { Currency } from './solution';

interface Order { id: string; status: 'open' | 'paid'; totalCents: number; customer: string }
declare const orders: Order[];
declare const order: Order;

// ---------- nothing is any ----------
type _n1 = ExpectFalse<IsAny<Parameters<typeof formatMoney>[0]>>;
type _n2 = ExpectFalse<IsAny<Parameters<typeof formatMoney>[1]>>;
type _n3 = ExpectFalse<IsAny<ReturnType<typeof formatMoney>>>;
type _n4 = ExpectFalse<IsAny<ReturnType<typeof sumBy>>>;
type _n5 = ExpectFalse<IsAny<ReturnType<typeof groupBy<Order, string>>>>;

// ---------- formatMoney ----------
type _c = Expect<Equal<Currency, 'GBP' | 'EUR' | 'USD'>>;
type _f = Expect<Equal<typeof formatMoney, (cents: number, currency?: Currency) => string>>;
formatMoney(1250);
formatMoney(1250, 'EUR');
// @ts-expect-error not a supported currency
formatMoney(1250, 'JPY');
// @ts-expect-error cents is a number
formatMoney('12.50');

// ---------- sumBy ----------
const total = sumBy(orders, (o) => o.totalCents);
type _s1 = Expect<Equal<typeof total, number>>;
// @ts-expect-error the callback must return a number
sumBy(orders, (o) => o.customer);
// @ts-expect-error the callback sees the real item type
sumBy(orders, (o) => o.amount);

// ---------- groupBy ----------
const byStatus = groupBy(orders, (o) => o.status);
type _g1 = Expect<Equal<typeof byStatus, Partial<Record<'open' | 'paid', Order[]>>>>;
// @ts-expect-error a group may be missing: check before using it
byStatus.open.length;
const openCount: number = byStatus.open?.length ?? 0;
const byCustomer = groupBy(orders, (o) => o.customer);
type _g2 = Expect<Equal<typeof byCustomer, Partial<Record<string, Order[]>>>>;

// ---------- pick ----------
const summary = pick(order, ['id', 'totalCents']);
type _p1 = Expect<Equal<typeof summary, Pick<Order, 'id' | 'totalCents'>>>;
// @ts-expect-error only real keys can be picked
pick(order, ['id', 'nope']);

// ---------- once ----------
declare function connect(url: string, retries: number): Promise<{ close(): void }>;
const connectOnce = once(connect);
type _o1 = Expect<Equal<Parameters<typeof connectOnce>, [url: string, retries: number]>>;
type _o2 = Expect<Equal<ReturnType<typeof connectOnce>, Promise<{ close(): void }>>>;
// @ts-expect-error the wrapped function keeps its parameters
connectOnce('postgres://db');
