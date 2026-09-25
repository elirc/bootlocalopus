/** The raw text of every `{...}` in S, e.g. 'name' | 'count:number'. */
type Placeholders<S extends string> =
  S extends `${string}{${infer Body}}${infer Rest}` ? Body | Placeholders<Rest> : never;

type NameOf<B extends string> = B extends `${infer Name}:${string}` ? Name : B;

type TypeOf<B extends string> =
  B extends `${string}:${infer Kind}`
    ? Kind extends 'string' ? string
    : Kind extends 'number' ? number
    : Kind extends 'date' ? Date
    : never
    : string;

export type FormatParams<S extends string> = {
  [B in Placeholders<S> as NameOf<B>]: TypeOf<B>;
};

/** No placeholders: no second argument at all. Otherwise: exactly the params. */
export type FormatArgs<S extends string> =
  [Placeholders<S>] extends [never] ? [] : [params: FormatParams<S>];

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
