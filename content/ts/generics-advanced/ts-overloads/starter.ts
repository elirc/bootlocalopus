// Every signature here is technically true and makes callers null-check or
// cast things they already know. Make the return types follow the arguments.

export function toDate(input: string | null): Date | null {
  return input === null ? null : new Date(input);
}

export interface Settings {
  theme: 'light' | 'dark';
  pageSize: number;
  beta: boolean;
}

export const settings: Settings = { theme: 'light', pageSize: 20, beta: false };

export function getSetting(key: keyof Settings): Settings[keyof Settings] {
  return settings[key];
}

export function findById(
  items: readonly { id: string }[],
  id: string,
  options?: { required: boolean },
): { id: string } | undefined {
  const found = items.find((item) => item.id === id);
  if (found === undefined && options?.required) throw new Error(`no item with id ${id}`);
  return found;
}
