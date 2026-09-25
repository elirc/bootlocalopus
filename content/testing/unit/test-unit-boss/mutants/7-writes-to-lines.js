/** Bad input to priceOrder. `code` is the contract; the message is prose. */
export class OrderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}

export const SHIPPING_CENTS = 495;
export const FREE_SHIPPING_FROM = 5000;

function discountFor(coupon, subtotal) {
  if (coupon === undefined) return 0;
  if (coupon.type !== 'percent' && coupon.type !== 'fixed') {
    throw new OrderError('BAD_COUPON', `unknown coupon type ${coupon.type}`);
  }
  if (coupon.minSpend !== undefined && subtotal < coupon.minSpend) {
    throw new OrderError('MIN_SPEND', `this coupon needs a subtotal of at least ${coupon.minSpend}`);
  }
  if (coupon.type === 'percent') return Math.round((subtotal * coupon.value) / 100);
  return Math.min(coupon.value, subtotal); // a fixed coupon never takes the total below zero
}

/**
 * Prices a cart in integer cents: { subtotal, discount, shipping, total }.
 * Shipping is free when the subtotal AFTER the discount is at least 5000.
 * Never changes `lines` or the objects in it.
 */
export function priceOrder(lines, { coupon } = {}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new OrderError('EMPTY', 'the cart is empty');
  lines.forEach((line, i) => {
    const ok = Number.isInteger(line.qty) && line.qty >= 1 && Number.isInteger(line.unitCents) && line.unitCents >= 0;
    if (!ok) throw new OrderError('BAD_LINE', `line ${i} needs a whole qty >= 1 and whole unitCents >= 0`);
  });

  for (const line of lines) line.lineCents = line.unitCents * line.qty;
  const subtotal = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const discount = discountFor(coupon, subtotal);
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= FREE_SHIPPING_FROM ? 0 : SHIPPING_CENTS;
  return { subtotal, discount, shipping, total: afterDiscount + shipping };
}
