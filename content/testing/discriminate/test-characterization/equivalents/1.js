const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 5000;

export function subtotalCents(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
}

export function discountCents(subtotal, config) {
  if (!config.discountPercent) return 0;
  const raw = Math.round(subtotal * (config.discountPercent / 100));
  return config.maxDiscountCents ? Math.min(raw, config.maxDiscountCents) : raw;
}

export function shippingCents(subtotal, config) {
  // The original compares the post-discount amount against a hardcoded 5000;
  // that number is really a configurable threshold.
  const threshold = config.freeShippingThresholdCents ?? DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS;
  return subtotal >= threshold ? 0 : (config.shippingCents || 0);
}

export function taxCents(taxable, config) {
  return Math.round(taxable * (config.taxPercent / 100));
}

export function validateOrder(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return ['order must have at least one item'];
  }
  const problems = [];
  for (const item of order.items) {
    if (!item.sku) problems.push('item missing sku');
    if (!(item.quantity > 0)) problems.push('quantity must be positive');
    if (!(item.unitCents > 0)) problems.push('unitCents must be positive');
  }
  return problems;
}

export function processOrder(order, config) {
  const problems = validateOrder(order);
  if (problems.length) return { ok: false, problems };

  const subtotal = subtotalCents(order.items);
  const discount = discountCents(subtotal, config);
  const shipping = shippingCents(subtotal - discount, config);
  const tax = taxCents(subtotal - discount + shipping, config);

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
