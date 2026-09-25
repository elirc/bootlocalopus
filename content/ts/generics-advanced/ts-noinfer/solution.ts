export interface Machine<S extends string> {
  readonly states: readonly S[];
  readonly current: S;
  go(next: S): void;
}

/** `states` is the source of truth; `initial` is only checked against it. */
export function createMachine<S extends string>(config: {
  states: readonly S[];
  initial: NoInfer<S>;
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

/** `value` decides `T`; a fallback outside `T` is a compile error, not a wider type. */
export function withDefault<T>(value: T | undefined, fallback: NoInfer<T>): T {
  return value === undefined ? fallback : value;
}

/** `fn` decides `T`; `onGiveUp` must produce the same type, not widen it. */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; onGiveUp: (lastError: unknown) => NoInfer<T> },
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
