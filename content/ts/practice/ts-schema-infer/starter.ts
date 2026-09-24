// The runtime works. The types do not: everything comes out as `unknown`,
// so the team writes `interface User` by hand next to the schema and the two drift.

export interface Schema<T> {
  parse(value: unknown): T;
}

export type Infer<S> = never; // TODO

const fail = (expected: string, value: unknown): never => {
  throw new TypeError(`expected ${expected}, got ${value === null ? 'null' : typeof value}`);
};

export const string = (): Schema<string> => ({
  parse: (value) => (typeof value === 'string' ? value : fail('string', value)),
});

export const number = (): Schema<number> => ({
  parse: (value) => (typeof value === 'number' ? value : fail('number', value)),
});

// TODO: object() needs a way to see that a key is optional
export const optional = (schema: Schema<unknown>): Schema<unknown> => ({
  parse: (value) => (value === undefined ? undefined : schema.parse(value)),
});

// TODO: keep the element type
export const arrayOf = (schema: Schema<unknown>): Schema<unknown[]> => ({
  parse: (value) => (Array.isArray(value) ? value.map((item) => schema.parse(item)) : fail('array', value)),
});

// TODO: the result type should be computed from the shape
export const object = (shape: Record<string, Schema<unknown>>): Schema<Record<string, unknown>> => ({
  parse(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('object', value);
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const parsed = shape[key]!.parse(Object.hasOwn(input, key) ? input[key] : undefined);
      if (parsed !== undefined) out[key] = parsed;
    }
    return out;
  },
});
