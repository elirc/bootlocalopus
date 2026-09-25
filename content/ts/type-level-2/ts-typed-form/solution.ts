/** Values a form field holds directly: never descended into. */
type Leaf = string | number | boolean | bigint | symbol | null | undefined | Date;

/**
 * Every dotted path to a field, including array positions:
 * 'customer.name' | 'items' | `items.${number}` | `items.${number}.qty' | …
 */
export type FieldPath<T> =
  T extends Leaf ? never
  : T extends readonly (infer E)[] ? `${number}` | `${number}.${FieldPath<E>}`
  : { [K in keyof T & string]: K | `${K}.${FieldPath<T[K]>}` }[keyof T & string];

/** One step down: an array takes a numeric segment, an object takes one of its keys. */
type Step<T, S extends string> =
  T extends readonly (infer E)[] ? (S extends `${number}` ? E : never)
  : S extends keyof T ? T[S]
  : never;

export type FieldValue<T, P extends string> =
  P extends `${infer Head}.${infer Rest}` ? FieldValue<Step<T, Head>, Rest> : Step<T, P>;

/** Errors mirror the values: a message where a value is, and every level optional. */
export type FormErrors<T> =
  T extends Leaf ? string
  : T extends readonly (infer E)[] ? (FormErrors<E> | undefined)[]
  : { [K in keyof T]?: FormErrors<T[K]> };

export interface Form<T> {
  readonly values: T;
  errors: FormErrors<T>;
  get<P extends FieldPath<T>>(path: P): FieldValue<T, P>;
  set<P extends FieldPath<T>>(path: P, value: FieldValue<T, P>): void;
  /** Several fields at once, in the order asked for. */
  watch<Ps extends readonly FieldPath<T>[]>(...paths: Ps): { -readonly [I in keyof Ps]: FieldValue<T, Ps[I] & string> };
  setError<P extends FieldPath<T>>(path: P, message: string): void;
}

type Bag = Record<string, unknown>;

function getIn(root: unknown, path: string): unknown {
  let current = root;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Bag)[key];
  }
  return current;
}

/** Writes `value` at `path`, creating arrays or objects for missing parents. */
function setIn(root: Bag, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Bag = root;
  keys.slice(0, -1).forEach((key, i) => {
    if (current[key] === null || typeof current[key] !== 'object') {
      current[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    current = current[key] as Bag;
  });
  current[keys[keys.length - 1]] = value;
}

/** Copies arrays and plain objects so the form never writes into `initial`. */
function cloneValue<V>(value: V): V {
  if (Array.isArray(value)) return value.map(cloneValue) as V;
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)])) as V;
  }
  return value;
}

export function createForm<T extends object>(initial: T): Form<T> {
  const values = cloneValue(initial);
  // An empty object is a valid FormErrors<T> for an object T; the checker cannot see that for a generic T.
  const errors = {} as FormErrors<T>;
  return {
    values,
    errors,
    // The path strings are checked at the call site; below this line they are plain strings.
    get: (path) => getIn(values, path) as FieldValue<T, typeof path>,
    set: (path, value) => setIn(values as Bag, path, value),
    watch: (...paths) => paths.map((p) => getIn(values, p)) as never,
    setError: (path, message) => setIn(errors as Bag, path, message),
  };
}
