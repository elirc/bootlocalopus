export interface Line { sku: string; priceCents: number; qty: number }
export interface User { id: string; name: string }
export interface CacheEntry<V> { value: V; expiresAt: number }

export type Guard<T> = (value: unknown) => value is T;

/** JSON.parse returns `any`; the honest type of parsed text is `unknown` until something checks it. */
export function readJson<T>(text: string, guard: Guard<T>): T {
  const value: unknown = JSON.parse(text);
  if (!guard(value)) throw new TypeError('JSON did not have the expected shape');
  return value;
}

export function totalCents(lines: readonly Line[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function pluck<T, K extends keyof T>(rows: readonly T[], key: K): T[K][] {
  return rows.map((row) => row[key]);
}

export function createCache<V>() {
  const entries = new Map<string, CacheEntry<V>>();
  return {
    get(key: string, now: number): V | undefined {
      const entry = entries.get(key);
      return entry && entry.expiresAt > now ? entry.value : undefined;
    },
    set(key: string, value: V, expiresAt: number): void {
      entries.set(key, { value, expiresAt });
    },
  };
}

export function isUser(value: unknown): value is User {
  // `in` narrows `object` to "has this key" (TS 4.9+), so no casts are needed.
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'name' in value && typeof value.name === 'string';
}
