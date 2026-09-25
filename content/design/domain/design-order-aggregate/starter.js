export const MAX_QUANTITY = 10;
export const MAX_LINES = 20;

export class DomainError extends Error {}

// Today an order is a plain object that five services edit directly:
//   order.lines.push(...); order.discount = 1500; order.status = 'placed';
// and each of them re-checks (some of) the rules.

export class Order {
  constructor(id) {
    this.id = id;
    this.status = 'draft';
    this.lines = [];
    this.coupon = null;
  }

  addItem(sku, unitPriceMinor, quantity) {
    this.lines.push({ sku, unitPriceMinor, quantity });
  }

  changeQuantity(sku, quantity) {
    throw new Error('TODO');
  }

  applyCoupon(coupon) {
    throw new Error('TODO');
  }

  removeCoupon() {
    throw new Error('TODO');
  }

  totals() {
    throw new Error('TODO');
  }

  snapshot() {
    return this;
  }

  place(at) {
    this.status = 'placed';
  }

  cancel() {
    this.status = 'cancelled';
  }
}
