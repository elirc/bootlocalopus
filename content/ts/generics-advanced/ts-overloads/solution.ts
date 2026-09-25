// Overloads: a small table of input → output cases.
// The last overload accepts the union so callers holding `string | null` still match.
export function toDate(input: string): Date;
export function toDate(input: null): null;
export function toDate(input: string | null): Date | null;
export function toDate(input: string | null): Date | null {
  return input === null ? null : new Date(input);
}

export interface Settings {
  theme: 'light' | 'dark';
  pageSize: number;
  beta: boolean;
}

export const settings: Settings = { theme: 'light', pageSize: 20, beta: false };

// A generic: the output is looked up from the input type, so one signature
// covers every key, and union keys, with no casts.
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return settings[key];
}

// Overloads and generics together: T flows through, `required: true` removes undefined.
export function findById<T extends { id: string }>(items: readonly T[], id: string, options: { required: true }): T;
export function findById<T extends { id: string }>(items: readonly T[], id: string, options?: { required: boolean }): T | undefined;
export function findById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  options?: { required: boolean },
): T | undefined {
  const found = items.find((item) => item.id === id);
  if (found === undefined && options?.required) throw new Error(`no item with id ${id}`);
  return found;
}
