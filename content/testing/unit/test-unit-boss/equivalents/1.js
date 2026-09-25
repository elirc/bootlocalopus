// Same behaviour: a loop, a switch, different messages, keys in a different order.
export class OrderError extends Error {
  constructor(code, message = code) {
    super(`order rejected (${message})`);
    this.name = 'OrderError';
    this.code = code;
  }
}

export const SHIPPING_CENTS = 495;
export const FREE_SHIPPING_FROM = 5000;

export function priceOrder(lines, options = {}) {
  const coupon = options.coupon;
  if (!Array.isArray(lines) || !lines.length) throw new OrderError('EMPTY');

  let subtotal = 0;
  for (const { qty, unitCents } of lines) {
    if (!Number.isInteger(qty) || qty < 1) throw new OrderError('BAD_LINE', 'qty');
    if (!Number.isInteger(unitCents) || unitCents < 0) throw new OrderError('BAD_LINE', 'price');
    subtotal += qty * unitCents;
  }

  let discount = 0;
  if (coupon !== undefined) {
    const known = ['percent', 'fixed'];
    if (!known.includes(coupon.type)) throw new OrderError('BAD_COUPON');
    if (typeof coupon.minSpend === 'number' && !(subtotal >= coupon.minSpend)) throw new OrderError('MIN_SPEND');
    switch (coupon.type) {
      case 'percent':
        discount = Math.floor((subtotal * coupon.value) / 100 + 0.5);
        break;
      default:
        discount = coupon.value > subtotal ? subtotal : coupon.value;
    }
  }

  const net = subtotal - discount;
  const shipping = net < FREE_SHIPPING_FROM ? SHIPPING_CENTS : 0;
  return { total: net + shipping, shipping, discount, subtotal };
}
