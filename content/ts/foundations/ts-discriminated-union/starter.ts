export type RequestState<T> = {
  // TODO: replace this loose shape with a real discriminated union
  status: string;
  data?: T;
  error?: Error;
};

export function assertNever(value: never): never {
  throw new Error('unexpected: ' + JSON.stringify(value));
}

export function render<T>(state: RequestState<T>): string {
  // TODO: switch on the discriminant and finish with assertNever
  return '';
}
