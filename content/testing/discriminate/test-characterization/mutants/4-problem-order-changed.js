export function processOrder(order, config) {
  // validation
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return { ok: false, problems: ['order must have at least one item'] };
  }
  const problems = [];
  const rules = [
    [(item) => !item.sku, 'item missing sku'],
    [(item) => !(item.quantity > 0), 'quantity must be positive'],
    [(item) => !(item.unitCents > 0), 'unitCents must be positive'],
  ];
  for (const [broken, message] of rules) {
    for (const item of order.items) {
      if (broken(item)) problems.push(message);
    }
  }
  if (problems.length) return { ok: false, problems };

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
