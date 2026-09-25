// orders.ts, straight from orders.js. Under `strict`, every `obj[key]` with a
// `string` key is "Element implicitly has an 'any' type". Fix the types.

export const STATUS_LABELS = {
  open: 'Open',
  paid: 'Paid',
  shipped: 'Shipped',
};

export type Status = string;

export interface Order {
  id: string;
  status: Status;
  totalCents: number;
  placedAt: Date;
  tags: string[];
}

export function isStatus(value: string): boolean {
  return value in STATUS_LABELS;
}

export function statusLabel(value: string): string {
  return STATUS_LABELS[value];
}

export function countByStatus(orders: readonly Order[]) {
  const counts = {};
  for (const order of orders) counts[order.status] = (counts[order.status] || 0) + 1;
  return counts;
}

export function getField(order: Order, field: string) {
  return order[field];
}

export type SortKey = string;

export function sortBy(orders: readonly Order[], field: SortKey): Order[] {
  return [...orders].sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0));
}
