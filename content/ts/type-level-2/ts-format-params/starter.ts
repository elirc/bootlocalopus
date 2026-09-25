// TODO: an object type with one key per placeholder in S.
export type FormatParams<S extends string> = Record<string, unknown>;

// TODO: [] when S has no placeholders, otherwise [params: FormatParams<S>].
export type FormatArgs<S extends string> = [params?: FormatParams<S>];

export function format<S extends string>(template: S, ...args: FormatArgs<S>): string {
  const params: Record<string, unknown> = args[0] ?? {};
  return template.replace(/\{(\w+)(?::\w+)?\}/g, (_, name: string) => {
    const value = params[name];
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  });
}

export function createTranslator<M extends Record<string, string>>(messages: M) {
  return <K extends keyof M & string>(key: K, ...args: FormatArgs<M[K]>): string =>
    format(messages[key], ...args);
}
