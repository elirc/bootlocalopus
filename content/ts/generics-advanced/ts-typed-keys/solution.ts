declare const phantom: unique symbol;

/**
 * A typed key. `T` only exists at compile time. The phantom member mentions
 * `T` as a parameter AND a return type, which makes Key invariant in `T`.
 */
export interface Key<T> {
  readonly name: string;
  readonly [phantom]?: (value: T) => T;
}

export function key<T>(name: string): Key<T> {
  return { name };
}

export class Context {
  // Keyed by identity: two keys with the same name never collide.
  private readonly values = new Map<object, unknown>();

  set<T>(key: Key<T>, value: T): this {
    this.values.set(key, value);
    return this;
  }

  get<T>(key: Key<T>): T | undefined {
    // Only `set` writes, and its signature pairs Key<T> with T.
    return this.values.get(key) as T | undefined;
  }

  require<T>(key: Key<T>): T {
    if (!this.values.has(key)) throw new Error(`missing context value: ${key.name}`);
    return this.values.get(key) as T;
  }

  has<T>(key: Key<T>): boolean {
    return this.values.has(key);
  }
}
