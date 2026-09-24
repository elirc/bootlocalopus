export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export function assertNever(value: never): never {
  throw new Error('unexpected: ' + JSON.stringify(value));
}

export function render<T>(state: RequestState<T>): string {
  switch (state.status) {
    case 'idle':
      return 'idle';
    case 'loading':
      return 'spinner';
    case 'success':
      return 'data';
    case 'error':
      return 'error: ' + state.error.message;
    default:
      // Compile-time proof that every case above is handled.
      return assertNever(state);
  }
}
