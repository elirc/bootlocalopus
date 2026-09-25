// Every function below infers its type parameter from ALL of its arguments,
// so a wrong fallback or a typo'd initial state widens the type instead of
// failing. Decide which argument is the source of truth.

export interface Machine<S extends string> {
  readonly states: readonly S[];
  readonly current: S;
  go(next: S): void;
}

export function createMachine<S extends string>(config: {
  states: readonly S[];
  initial: S;
}): Machine<S> {
  let current: S = config.initial;
  return {
    states: config.states,
    get current() {
      return current;
    },
    go(next) {
      current = next;
    },
  };
}

export function withDefault<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; onGiveUp: (lastError: unknown) => T },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  return options.onGiveUp(lastError);
}
