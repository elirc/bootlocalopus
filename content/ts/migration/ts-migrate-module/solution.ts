const PRODUCTS = {
  'MUG-1': { name: 'Mug', priceCents: 800 },
  'TEE-2': { name: 'T-shirt', priceCents: 1800 },
  'CAP-3': { name: 'Cap', priceCents: 1200 },
} as const;

export type Sku = keyof typeof PRODUCTS;

export interface CartLine { sku: Sku; qty: number }

export interface Coupon { code: string; percent: number; minCents: number }

export interface Summary { subtotalCents: number; discountCents: number; totalCents: number }

export type ParseCartResult = { ok: true; lines: CartLine[] } | { ok: false; error: string };

export type CheckoutResult = { ok: true; summary: Summary } | { ok: false; error: string };

export type CartListener = (summary: Summary) => void;

const COUPONS: readonly Coupon[] = [
  { code: 'TENOFF', percent: 10, minCents: 2000 },
  { code: 'HALF', percent: 50, minCents: 10000 },
];

const listeners = new Set<CartListener>();

export function isSku(value: string): value is Sku {
  return Object.hasOwn(PRODUCTS, value);
}

export function lineTotal(line: CartLine): number {
  return PRODUCTS[line.sku].priceCents * line.qty;
}

export function findCoupon(code: string): Coupon | undefined {
  return COUPONS.find((c) => c.code === code.toUpperCase());
}

/** Decision: an unknown code, or one below its minimum, leaves the subtotal unchanged. */
export function applyCoupon(subtotalCents: number, code: string): number {
  const coupon = findCoupon(code);
  if (!coupon || subtotalCents < coupon.minCents) return subtotalCents;
  return Math.round(subtotalCents * (1 - coupon.percent / 100));
}

function toLine(value: unknown): CartLine | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('sku' in value) || typeof value.sku !== 'string' || !isSku(value.sku)) return undefined;
  if (!('qty' in value) || typeof value.qty !== 'number' || !Number.isInteger(value.qty) || value.qty < 1) return undefined;
  return { sku: value.sku, qty: value.qty };
}

export function parseCart(json: string): ParseCartResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Cart is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || !('lines' in data) || !Array.isArray(data.lines)) {
    return { ok: false, error: 'Cart has no lines' };
  }
  // Array.isArray narrows to any[]; put the unknown back before touching the elements.
  const rawLines: readonly unknown[] = data.lines;
  const lines: CartLine[] = [];
  for (const [i, raw] of rawLines.entries()) {
    const line = toLine(raw);
    if (!line) return { ok: false, error: `Line ${i} is invalid` };
    lines.push(line);
  }
  return { ok: true, lines };
}

export function summarize(lines: readonly CartLine[], code?: string): Summary {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const totalCents = code ? applyCoupon(subtotalCents, code) : subtotalCents;
  return { subtotalCents, discountCents: subtotalCents - totalCents, totalCents };
}

export function onCartChange(listener: CartListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function checkout(json: string, code?: string): CheckoutResult {
  const cart = parseCart(json);
  if (!cart.ok) return cart;
  try {
    const summary = summarize(cart.lines, code);
    for (const listener of listeners) listener(summary);
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
