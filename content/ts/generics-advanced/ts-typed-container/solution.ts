/** Flattens an intersection into one object type, so it prints (and compares) as a plain object. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * A name `provide`/`value` will accept: a string literal not already registered.
 * A plain `string` would register "some key" and lose every name that came before.
 */
export type NewName<K extends string, D> = string extends K ? never : K extends keyof D ? never : K;

interface Entry {
  readonly name: string;
  readonly make: (deps: Record<string, unknown>) => unknown;
}

/**
 * An immutable builder. Each registration returns a NEW container whose type
 * parameter records one more dependency, so the type state and the runtime
 * state can never disagree.
 */
export class Container<D> {
  // Only this class creates containers, and only from entries whose types it checked.
  private constructor(private readonly entries: readonly Entry[]) {}

  static empty(): Container<{}> {
    return new Container<{}>([]);
  }

  provide<K extends string, V>(
    name: NewName<K, D>,
    factory: (deps: D) => V,
  ): Container<Simplify<D & { [P in K]: V }>> {
    // Stored untyped; `D` guarantees every dependency the factory reads was registered first.
    const make = factory as unknown as Entry['make'];
    return new Container([...this.entries, { name, make }]);
  }

  value<K extends string, V>(name: NewName<K, D>, value: V): Container<Simplify<D & { [P in K]: V }>> {
    return new Container([...this.entries, { name, make: () => value }]);
  }

  /** Swap one registered dependency for a fake of the same type (tests). */
  override<K extends keyof D & string>(name: K, make: () => D[K]): Container<D> {
    return new Container(this.entries.map((entry) => (entry.name === name ? { name, make } : entry)));
  }

  /** Instantiates every dependency once, in registration order. */
  build(): D {
    const resolved: Record<string, unknown> = {};
    for (const entry of this.entries) resolved[entry.name] = entry.make(resolved);
    // Every key of D was registered above, with a value of the registered type.
    return resolved as D;
  }
}

export function container(): Container<{}> {
  return Container.empty();
}

/** The dependency map a container provides. */
export type Deps<C> = C extends Container<infer D> ? D : never;
