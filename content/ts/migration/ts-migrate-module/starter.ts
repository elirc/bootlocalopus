// cart.ts: renamed from cart.js this morning. Under `strict` it has errors on
// most lines. Migrate it: see the brief for the exact types the rest of the
// app needs from this module.

const PRODUCTS = {
  'MUG-1': { name: 'Mug', priceCents: 800 },
  'TEE-2': { name: 'T-shirt', priceCents: 1800 },
  'CAP-3': { name: 'Cap', priceCents: 1200 },
};

const COUPONS = [
  { code: 'TENOFF', percent: 10, minCents: 2000 },
  { code: 'HALF', percent: 50, minCents: 10000 },
];

const listeners = [];

export function isSku(value) {
  return value in PRODUCTS;
}

export function lineTotal(line) {
  return PRODUCTS[line.sku].priceCents * line.qty;
}

export function findCoupon(code) {
  return COUPONS.find((c) => c.code === code.toUpperCase());
}

export function applyCoupon(subtotalCents, code) {
  const coupon = findCoupon(code);
  if (subtotalCents < coupon.minCents) return subtotalCents;
  return Math.round(subtotalCents * (1 - coupon.percent / 100));
}

export function parseCart(json) {
  const data = JSON.parse(json);
  return { ok: true, lines: data.lines };
}

export function summarize(lines, code) {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const totalCents = code ? applyCoupon(subtotalCents, code) : subtotalCents;
  return { subtotalCents, discountCents: subtotalCents - totalCents, totalCents };
}

export function onCartChange(listener) {
  listeners.push(listener);
  return () => listeners.splice(listeners.indexOf(listener), 1);
}

export function checkout(json, code) {
  try {
    const cart = parseCart(json);
    const summary = summarize(cart.lines, code);
    listeners.forEach((l) => l(summary));
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
