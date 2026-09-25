// These all check the right things at runtime and tell the compiler nothing:
// after `assertDefined(user, 'user')`, `user` is still `User | undefined`.

export class AssertionError extends Error {
  override name = 'AssertionError';
}

export function assert(condition: unknown, message: string): void {
  if (!condition) throw new AssertionError(message);
}

export function assertDefined(value: unknown, name: string): void {
  if (value === null || value === undefined) throw new AssertionError(`${name} is ${value}`);
}

export const ensure = {
  string(value: unknown, name: string): void {
    if (typeof value !== 'string') throw new AssertionError(`${name} must be a string`);
  },
  finiteNumber(value: unknown, name: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new AssertionError(`${name} must be a finite number`);
  },
  oneOf(value: unknown, allowed: readonly string[], name: string): void {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new AssertionError(`${name} must be one of ${allowed.join(', ')}`);
    }
  },
};

// TODO: a Draft whose title and publishAt are known to be present.
export type Publishable = Draft;

export class Draft {
  title?: string;
  publishAt?: Date;

  assertPublishable(): void {
    if (!this.title) throw new AssertionError('a draft needs a title to publish');
    if (!this.publishAt) throw new AssertionError('a draft needs a publish date');
  }
}
