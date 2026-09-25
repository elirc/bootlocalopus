export const REFUND_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class DomainError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

/** Largest-remainder allocation of a non-negative integer total. */
export function allocate(total, ratios) {
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  if (ratioSum === 0) return ratios.map(() => 0);
  const parts = ratios.map((ratio, index) => ({
    index,
    base: Math.floor((total * ratio) / ratioSum),
    remainder: (total * ratio) % ratioSum,
  }));
  let leftover = total - parts.reduce((sum, p) => sum + p.base, 0);
  for (const part of [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (leftover === 0) break;
    part.base += 1;
    leftover -= 1;
  }
  return parts.map((p) => p.base);
}

const isCount = (n) => Number.isInteger(n) && n >= 1;
const isAmount = (n) => Number.isInteger(n) && n >= 0;

// ---- evolve: facts -> state ------------------------------------------------------

/**
 * Pricing is decided once, when the order is placed: the discount is allocated
 * over lines, and each line's net amount over its units. Every refund then just
 * takes the next unit amounts, so refunding everything returns exactly what was paid.
 */
function priceOrder(event) {
  const gross = event.lines.map((l) => l.unitPriceMinor * l.quantity);
  const discounts = allocate(event.discountMinor, gross);
  const lines = event.lines.map((line, i) => {
    const netMinor = gross[i] - discounts[i];
    return {
      sku: line.sku,
      quantity: line.quantity,
      finalSale: Boolean(line.finalSale),
      netMinor,
      unitAmounts: allocate(netMinor, Array.from({ length: line.quantity }, () => 1)),
      refundedQuantity: 0,
    };
  });
  return {
    orderId: event.orderId,
    currency: event.currency,
    placedAt: event.placedAt,
    shippingMinor: event.shippingMinor,
    shippingRefunded: false,
    paidMinor: lines.reduce((s, l) => s + l.netMinor, 0) + event.shippingMinor,
    refundedMinor: 0,
    lines,
    refunds: {},
  };
}

export function evolve(state, event) {
  switch (event.type) {
    case 'OrderPlaced':
      return priceOrder(event);
    case 'RefundIssued': {
      const quantities = new Map(event.items.map((i) => [i.sku, i.quantity]));
      return {
        ...state,
        lines: state.lines.map((l) => (quantities.has(l.sku) ? { ...l, refundedQuantity: l.refundedQuantity + quantities.get(l.sku) } : l)),
        shippingRefunded: state.shippingRefunded || event.shippingMinor > 0,
        refundedMinor: state.refundedMinor + event.totalMinor,
        refunds: { ...state.refunds, [event.refundId]: event.items.map(({ sku, quantity }) => ({ sku, quantity })) },
      };
    }
    default:
      return state;
  }
}

export function rehydrate(events) {
  return events.reduce(evolve, null);
}

// ---- decide: commands -> facts ------------------------------------------------

function placeOrder(state, command) {
  if (state !== null) throw new DomainError('ALREADY_PLACED');
  const { orderId, currency, lines, discountMinor = 0, shippingMinor = 0, placedAt } = command;
  if (!Array.isArray(lines) || lines.length === 0) throw new DomainError('INVALID_ORDER', 'An order needs lines');
  const skus = new Set();
  for (const line of lines) {
    if (skus.has(line.sku)) throw new DomainError('INVALID_ORDER', `Duplicate SKU ${line.sku}`);
    skus.add(line.sku);
    if (!isCount(line.quantity) || !isAmount(line.unitPriceMinor)) throw new DomainError('INVALID_ORDER', `Bad line ${line.sku}`);
  }
  if (!isAmount(shippingMinor)) throw new DomainError('INVALID_ORDER', 'Bad shipping');
  const gross = lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
  if (!isAmount(discountMinor) || discountMinor > gross) throw new DomainError('INVALID_DISCOUNT');
  return [{
    type: 'OrderPlaced',
    orderId,
    currency,
    placedAt,
    discountMinor,
    shippingMinor,
    lines: lines.map(({ sku, unitPriceMinor, quantity, finalSale = false }) => ({ sku, unitPriceMinor, quantity, finalSale })),
  }];
}

const sameItems = (a, b) => a.length === b.length && a.every((x, i) => x.sku === b[i].sku && x.quantity === b[i].quantity);

function requestRefund(state, command) {
  if (state === null) throw new DomainError('NOT_PLACED');
  const { refundId, items, at } = command;

  if (Object.hasOwn(state.refunds, refundId)) {
    if (sameItems(state.refunds[refundId], items ?? [])) return []; // the same request, retried
    throw new DomainError('REFUND_ID_REUSED');
  }
  if (!Array.isArray(items) || items.length === 0) throw new DomainError('EMPTY_REFUND');
  if (Date.parse(at) - Date.parse(state.placedAt) > REFUND_WINDOW_DAYS * DAY_MS) throw new DomainError('WINDOW_CLOSED');

  const seen = new Set();
  const refundItems = items.map(({ sku, quantity }) => {
    const line = state.lines.find((l) => l.sku === sku);
    if (!line) throw new DomainError('UNKNOWN_SKU', sku);
    if (seen.has(sku)) throw new DomainError('INVALID_REQUEST', `${sku} listed twice`);
    seen.add(sku);
    if (!isCount(quantity)) throw new DomainError('INVALID_QUANTITY');
    if (line.finalSale) throw new DomainError('FINAL_SALE', sku);
    if (line.refundedQuantity + quantity > line.quantity) throw new DomainError('EXCEEDS_REFUNDABLE', sku);
    const amounts = line.unitAmounts.slice(line.refundedQuantity, line.refundedQuantity + quantity);
    return { sku, quantity, amountMinor: amounts.reduce((a, b) => a + b, 0) };
  });

  // Shipping comes back only with the refund that returns the last unit.
  const remainingAfter = state.lines.reduce((sum, line) => {
    const item = refundItems.find((i) => i.sku === line.sku);
    return sum + line.quantity - line.refundedQuantity - (item ? item.quantity : 0);
  }, 0);
  const shippingMinor = remainingAfter === 0 && !state.shippingRefunded ? state.shippingMinor : 0;
  const itemsTotal = refundItems.reduce((s, i) => s + i.amountMinor, 0);

  return [{ type: 'RefundIssued', refundId, items: refundItems, shippingMinor, totalMinor: itemsTotal + shippingMinor }];
}

export function decide(state, command) {
  switch (command.type) {
    case 'PlaceOrder': return placeOrder(state, command);
    case 'RequestRefund': return requestRefund(state, command);
    default: throw new DomainError('UNKNOWN_COMMAND');
  }
}

// ---- a read model -------------------------------------------------------------

export function summarize(state) {
  return {
    orderId: state.orderId,
    currency: state.currency,
    paidMinor: state.paidMinor,
    refundedMinor: state.refundedMinor,
    lines: state.lines.map(({ sku, quantity, refundedQuantity, netMinor }) => ({ sku, quantity, refundedQuantity, netMinor })),
  };
}
