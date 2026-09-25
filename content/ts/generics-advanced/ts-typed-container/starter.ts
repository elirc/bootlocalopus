// Works at runtime; knows nothing at compile time. Every dependency is
// `unknown`, so each consumer casts: `app.db as Db`. Give the container a type
// parameter that records what has been registered so far.

type AnyDeps = Record<string, unknown>;

interface Entry {
  readonly name: string;
  readonly make: (deps: AnyDeps) => unknown;
}

export class Container {
  private constructor(private readonly entries: readonly Entry[]) {}

  static empty(): Container {
    return new Container([]);
  }

  provide(name: string, factory: (deps: AnyDeps) => unknown): Container {
    return new Container([...this.entries, { name, make: factory }]);
  }

  value(name: string, value: unknown): Container {
    return new Container([...this.entries, { name, make: () => value }]);
  }

  override(name: string, make: () => unknown): Container {
    return new Container(this.entries.map((entry) => (entry.name === name ? { name, make } : entry)));
  }

  build(): AnyDeps {
    const resolved: AnyDeps = {};
    for (const entry of this.entries) resolved[entry.name] = entry.make(resolved);
    return resolved;
  }
}

export function container(): Container {
  return Container.empty();
}

// TODO: the dependency map a container provides.
export type Deps<C> = AnyDeps;
