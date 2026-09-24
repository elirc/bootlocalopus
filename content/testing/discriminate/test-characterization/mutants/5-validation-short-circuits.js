export function processOrder(order, config) {
  // validation
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return { ok: false, problems: ['order must have at least one item'] };
  }
  for (const item of order.items) {
    if (!item.sku) return { ok: false, problems: ['item missing sku'] };
    if (!(item.quantity > 0)) return { ok: false, problems: ['quantity must be positive'] };
    if (!(item.unitCents > 0)) return { ok: false, problems: ['unitCents must be positive'] };
  }

  // totals
  let subtotal = 0;
  for (const item of order.items) {
    subtotal = subtotal + item.quantity * item.unitCents;
  }

  let discount = 0;
  if (config.discountPercent) {
    discount = Math.round(subtotal * (config.discountPercent / 100));
    if (config.maxDiscountCents && discount > config.maxDiscountCents) {
      discount = config.maxDiscountCents;
    }
  }

  let shipping = config.shippingCents || 0;
  if (subtotal - discount >= 5000) {
    shipping = 0;
  }

  const tax = Math.round((subtotal - discount + shipping) * (config.taxPercent / 100));

  return {
    ok: true,
    problems: [],
    subtotalCents: subtotal,
    discountCents: discount,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: subtotal - discount + shipping + tax,
  };
}
