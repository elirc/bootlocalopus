export interface Schema<T> {
  parse(value: unknown): T;
}

/** An optional schema carries a marker so `object()` can tell which keys get `?:`. */
export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Shape = Record<string, Schema<unknown>>;

/** Flattens an intersection into one object type, so `Equal` sees `{ a; b? }` rather than `{ a } & { b? }`. */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never }[keyof S];
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;

export type InferShape<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: Infer<S[K]> } &
  { [K in OptionalKeys<S>]?: Exclude<Infer<S[K]>, undefined> }
>;

const fail = (expected: string, value: unknown): never => {
  throw new TypeError(`expected ${expected}, got ${value === null ? 'null' : typeof value}`);
};

export const string = (): Schema<string> => ({
  parse: (value) => (typeof value === 'string' ? value : fail('string', value)),
});

export const number = (): Schema<number> => ({
  parse: (value) => (typeof value === 'number' ? value : fail('number', value)),
});

export const optional = <T>(schema: Schema<T>): OptionalSchema<T> => ({
  optional: true,
  parse: (value) => (value === undefined ? undefined : schema.parse(value)),
});

export const arrayOf = <T>(schema: Schema<T>): Schema<T[]> => ({
  parse: (value) => (Array.isArray(value) ? value.map((item) => schema.parse(item)) : fail('array', value)),
});

export const object = <S extends Shape>(shape: S): Schema<InferShape<S>> => ({
  parse(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('object', value);
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const parsed = shape[key]!.parse(Object.hasOwn(input, key) ? input[key] : undefined);
      if (parsed !== undefined) out[key] = parsed;
    }
    return out as InferShape<S>;
  },
});
