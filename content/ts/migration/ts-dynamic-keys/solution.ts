export const STATUS_LABELS = {
  open: 'Open',
  paid: 'Paid',
  shipped: 'Shipped',
} as const;

export type Status = keyof typeof STATUS_LABELS;

export interface Order {
  id: string;
  status: Status;
  totalCents: number;
  placedAt: Date;
  tags: string[];
}

/** Own keys only: `'toString' in STATUS_LABELS` is true. */
export function isStatus(value: string): value is Status {
  return Object.hasOwn(STATUS_LABELS, value);
}

/** For a string from outside (a URL, a CSV): it might not be a status at all. */
export function statusLabel(value: string): string | undefined {
  return isStatus(value) ? STATUS_LABELS[value] : undefined;
}

/** Every status is present, even with a count of 0. */
export function countByStatus(orders: readonly Order[]): Record<Status, number> {
  const counts: Record<Status, number> = { open: 0, paid: 0, shipped: 0 };
  for (const order of orders) counts[order.status] += 1;
  return counts;
}

export function getField<K extends keyof Order>(order: Order, field: K): Order[K] {
  return order[field];
}

/** The keys of Order whose values can be compared with < and >. */
export type SortKey = { [K in keyof Order]: Order[K] extends string | number ? K : never }[keyof Order];

export function sortBy(orders: readonly Order[], field: SortKey): Order[] {
  return [...orders].sort((a, b) => {
    const x = a[field];
    const y = b[field];
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
