// T is declared but never used, so every Key is the same type and the
// Context cannot tell a Key<number> from a Key<string>.
export interface Key<T> {
  readonly name: string;
}

export function key<T>(name: string): Key<T> {
  return { name };
}

export class Context {
  private readonly values = new Map<object, unknown>();

  set(key: Key<unknown>, value: unknown): this {
    this.values.set(key, value);
    return this;
  }

  get(key: Key<unknown>): unknown {
    return this.values.get(key);
  }

  require(key: Key<unknown>): unknown {
    if (!this.values.has(key)) throw new Error(`missing context value: ${key.name}`);
    return this.values.get(key);
  }

  has(key: Key<unknown>): boolean {
    return this.values.has(key);
  }
}
