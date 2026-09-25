export const MAX_QUANTITY = 10;
export const MAX_LINES = 20;

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const isQuantity = (q) => Number.isInteger(q) && q >= 1;

/**
 * The aggregate root. Every change goes through a method that checks the
 * rules first and only then touches state, so a failed call changes nothing.
 */
export class Order {
  #id;
  #status = 'draft';
  #lines = new Map(); // sku -> { sku, unitPriceMinor, quantity }
  #coupon = null;
  #placedAt = null;

  constructor(id) {
    this.#id = id;
  }

  // ---- queries --------------------------------------------------------------

  #subtotal() {
    let sum = 0;
    for (const line of this.#lines.values()) sum += line.unitPriceMinor * line.quantity;
    return sum;
  }

  #discountFor(coupon, subtotal) {
    if (!coupon) return 0;
    const raw = coupon.percentOff !== undefined
      ? Math.round((subtotal * coupon.percentOff) / 100)
      : coupon.amountOffMinor;
    return Math.min(raw, subtotal); // a discount never makes the total negative
  }

  totals() {
    const subtotalMinor = this.#subtotal();
    const discountMinor = this.#discountFor(this.#coupon, subtotalMinor);
    return { subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor };
  }

  snapshot() {
    return {
      id: this.#id,
      status: this.#status,
      lines: [...this.#lines.values()].map((line) => ({ ...line })),
      coupon: this.#coupon ? { ...this.#coupon } : null,
      placedAt: this.#placedAt,
      ...this.totals(),
    };
  }

  // ---- commands -------------------------------------------------------------

  #mustBeDraft() {
    if (this.#status !== 'draft') throw new DomainError('INVALID_STATUS', `Order is ${this.#status}`);
  }

  /** After any change to the lines, a coupon whose minimum is no longer met falls off. */
  #revalidateCoupon() {
    if (this.#coupon && this.#subtotal() < this.#coupon.minSubtotalMinor) this.#coupon = null;
  }

  addItem(sku, unitPriceMinor, quantity) {
    this.#mustBeDraft();
    if (!isQuantity(quantity)) throw new DomainError('INVALID_QUANTITY', 'Quantity must be a positive integer');
    if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) throw new DomainError('INVALID_PRICE', 'Price must be a non-negative integer');
    const existing = this.#lines.get(sku);
    if (existing) {
      if (existing.unitPriceMinor !== unitPriceMinor) throw new DomainError('PRICE_MISMATCH', `${sku} is already in the order at another price`);
      if (existing.quantity + quantity > MAX_QUANTITY) throw new DomainError('QUANTITY_LIMIT', `At most ${MAX_QUANTITY} of ${sku}`);
      existing.quantity += quantity;
      return;
    }
    if (quantity > MAX_QUANTITY) throw new DomainError('QUANTITY_LIMIT', `At most ${MAX_QUANTITY} of ${sku}`);
    if (this.#lines.size >= MAX_LINES) throw new DomainError('TOO_MANY_LINES', `At most ${MAX_LINES} lines`);
    this.#lines.set(sku, { sku, unitPriceMinor, quantity });
  }

  changeQuantity(sku, quantity) {
    this.#mustBeDraft();
    const line = this.#lines.get(sku);
    if (!line) throw new DomainError('UNKNOWN_LINE', `${sku} is not in the order`);
    if (quantity === 0) {
      this.#lines.delete(sku);
    } else {
      if (!isQuantity(quantity)) throw new DomainError('INVALID_QUANTITY', 'Quantity must be a non-negative integer');
      if (quantity > MAX_QUANTITY) throw new DomainError('QUANTITY_LIMIT', `At most ${MAX_QUANTITY} of ${sku}`);
      line.quantity = quantity;
    }
    this.#revalidateCoupon();
  }

  applyCoupon({ code, percentOff, amountOffMinor, minSubtotalMinor = 0 }) {
    this.#mustBeDraft();
    const hasPercent = percentOff !== undefined;
    const hasAmount = amountOffMinor !== undefined;
    if (hasPercent === hasAmount) throw new DomainError('INVALID_COUPON', 'A coupon has exactly one of percentOff or amountOffMinor');
    if (hasPercent && !(Number.isInteger(percentOff) && percentOff >= 1 && percentOff <= 100)) {
      throw new DomainError('INVALID_COUPON', 'percentOff must be 1-100');
    }
    if (hasAmount && !(Number.isInteger(amountOffMinor) && amountOffMinor > 0)) {
      throw new DomainError('INVALID_COUPON', 'amountOffMinor must be a positive integer');
    }
    if (this.#subtotal() < minSubtotalMinor) throw new DomainError('COUPON_MINIMUM', `${code} needs a subtotal of ${minSubtotalMinor}`);
    this.#coupon = hasPercent ? { code, percentOff, minSubtotalMinor } : { code, amountOffMinor, minSubtotalMinor };
  }

  removeCoupon() {
    this.#mustBeDraft();
    this.#coupon = null;
  }

  place(at) {
    this.#mustBeDraft();
    if (this.#lines.size === 0) throw new DomainError('EMPTY_ORDER', 'Cannot place an empty order');
    this.#status = 'placed';
    this.#placedAt = at;
  }

  cancel() {
    if (this.#status === 'cancelled') throw new DomainError('INVALID_STATUS', 'Order is already cancelled');
    this.#status = 'cancelled';
  }
}
