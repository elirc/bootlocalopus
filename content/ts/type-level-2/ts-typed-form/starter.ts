// TODO: every dotted path to a field, including array positions ('items.0.qty').
export type FieldPath<T> = string;

// TODO: the type of the field at path P.
export type FieldValue<T, P extends string> = unknown;

// TODO: the same shape as T, with a string message where each value is, and every level optional.
export type FormErrors<T> = Record<string, unknown>;

// TODO: type these methods with FieldPath / FieldValue.
export interface Form<T> {
  readonly values: T;
  errors: FormErrors<T>;
  get(path: string): unknown;
  set(path: string, value: unknown): void;
  /** Several fields at once, in the order asked for. */
  watch(...paths: string[]): unknown[];
  setError(path: string, message: string): void;
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

// The runtime is done. Once the types above are right, the casts below may need adjusting.
export function createForm<T extends object>(initial: T): Form<T> {
  const values = cloneValue(initial);
  const errors = {} as FormErrors<T>;
  return {
    values,
    errors,
    get: (path) => getIn(values, path),
    set: (path, value) => setIn(values as Bag, path, value),
    watch: (...paths) => paths.map((p) => getIn(values, p)),
    setError: (path, message) => setIn(errors as Bag, path, message),
  };
}
