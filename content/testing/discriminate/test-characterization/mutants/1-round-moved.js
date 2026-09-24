export function processOrder(order, config) {
  // validation
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return { ok: false, problems: ['order must have at least one item'] };
  }
  const problems = [];
  for (const item of order.items) {
    if (!item.sku) problems.push('item missing sku');
    if (!(item.quantity > 0)) problems.push('quantity must be positive');
    if (!(item.unitCents > 0)) problems.push('unitCents must be positive');
  }
  if (problems.length) return { ok: false, problems };

  // totals
  let subtotal = 0;
  for (const item of order.items) {
    subtotal = subtotal + item.quantity * item.unitCents;
  }

  let discount = 0;
  if (config.discountPercent) {
    discount = subtotal * (config.discountPercent / 100); // rounded once, at the end
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
    totalCents: Math.round(subtotal - discount + shipping + tax),
  };
}
