export function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

export function indexById<T extends { id: string | number }>(items: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[String(item.id)] = item;
  return out;
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}

export function sortBy<T>(items: T[], key: keyof T): T[] {
  return [...items].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
}

export function merge<A, B>(a: A, b: B): A & B {
  return { ...a, ...b } as A & B;
}
