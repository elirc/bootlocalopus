import { isSku, lineTotal, findCoupon, applyCoupon, parseCart, summarize, onCartChange, checkout } from './solution';
import type { Sku, CartLine, Coupon, Summary, ParseCartResult, CheckoutResult, CartListener } from './solution';

// ---------- the exported types ----------
type _sku = Expect<Equal<Sku, 'MUG-1' | 'TEE-2' | 'CAP-3'>>;
type _line = Expect<Equal<CartLine, { sku: Sku; qty: number }>>;
type _coupon = Expect<Equal<Coupon, { code: string; percent: number; minCents: number }>>;
type _summary = Expect<Equal<Summary, { subtotalCents: number; discountCents: number; totalCents: number }>>;
type _pcr = Expect<Equal<ParseCartResult, { ok: true; lines: CartLine[] } | { ok: false; error: string }>>;
type _cr = Expect<Equal<CheckoutResult, { ok: true; summary: Summary } | { ok: false; error: string }>>;
type _cl = Expect<Equal<CartListener, (summary: Summary) => void>>;

// ---------- signatures ----------
type _f1 = Expect<Equal<typeof lineTotal, (line: CartLine) => number>>;
type _f2 = Expect<Equal<typeof findCoupon, (code: string) => Coupon | undefined>>;
type _f3 = Expect<Equal<typeof applyCoupon, (subtotalCents: number, code: string) => number>>;
type _f4 = Expect<Equal<typeof parseCart, (json: string) => ParseCartResult>>;
type _f5 = Expect<Equal<typeof summarize, (lines: readonly CartLine[], code?: string) => Summary>>;
type _f6 = Expect<Equal<typeof onCartChange, (listener: CartListener) => () => void>>;
type _f7 = Expect<Equal<typeof checkout, (json: string, code?: string) => CheckoutResult>>;

// ---------- isSku narrows ----------
declare const fromForm: string;
if (isSku(fromForm)) {
  const line: CartLine = { sku: fromForm, qty: 1 };
}
// @ts-expect-error a raw string is not a Sku
const bad: CartLine = { sku: fromForm, qty: 1 };
// @ts-expect-error unknown product
lineTotal({ sku: 'MUG-9', qty: 1 });

// ---------- callers must handle the misses ----------
// @ts-expect-error a coupon may not exist
findCoupon('tenoff').percent;
const parsed = parseCart('{}');
// @ts-expect-error check ok before reading lines
parsed.lines;
if (parsed.ok) {
  const s: Summary = summarize(parsed.lines, 'TENOFF');
} else {
  const why: string = parsed.error;
}

// ---------- listeners are strictly typed ----------
const unsubscribe = onCartChange((s) => { const t: number = s.totalCents; });
unsubscribe();
// @ts-expect-error a listener receives a Summary, not a string
onCartChange((s: string) => s.trim());

// ---------- summarize accepts readonly input ----------
declare const frozenLines: readonly CartLine[];
summarize(frozenLines);

// ---------- nothing is any ----------
type _a1 = ExpectFalse<IsAny<Parameters<typeof isSku>[0]>>;
type _a2 = ExpectFalse<IsAny<ReturnType<typeof checkout>>>;
type _a3 = ExpectFalse<IsAny<ReturnType<typeof parseCart>>>;
