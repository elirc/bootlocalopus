// This file compiles under `strict`. It is also barely checked: every `any`
// below leaks into every caller. Remove them.

export interface Line { sku: string; priceCents: number; qty: number }
export interface User { id: string; name: string }
export interface CacheEntry<V> { value: V; expiresAt: number }

export type Guard<T> = (value: unknown) => value is T;

// "Typed" JSON: readJson<User>(text) returns a User that nobody checked.
export function readJson<T = any>(text: string): T {
  return JSON.parse(text);
}

export function totalCents(lines: any[]) {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
}

export function errorMessage(error: any) {
  return error.message;
}

export function pluck(rows: any[], key: string) {
  return rows.map((row) => row[key]);
}

export function createCache() {
  const entries: any = {};
  return {
    get(key: string, now: number) {
      const entry = entries[key];
      return entry && entry.expiresAt > now ? entry.value : undefined;
    },
    set(key: string, value: any, expiresAt: number) {
      entries[key] = { value, expiresAt };
    },
  };
}

export function isUser(value: any): value is User {
  return typeof value?.id === 'string' && typeof value?.name === 'string';
}
