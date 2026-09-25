export class AssertionError extends Error {
  override name = 'AssertionError';
}

/** After a call returns, TypeScript treats `condition` as true. */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionError(message);
}

export function assertDefined<T>(value: T, name: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) throw new AssertionError(`${name} is ${value}`);
}

/**
 * Assertion signatures only take effect when the callee's type is written
 * down. An object literal's inferred type is not, so `ensure` is annotated
 * with this interface; without it every `ensure.x(…)` call is error TS2775.
 */
export interface Ensure {
  string(value: unknown, name: string): asserts value is string;
  finiteNumber(value: unknown, name: string): asserts value is number;
  oneOf<const T extends readonly string[]>(value: unknown, allowed: T, name: string): asserts value is T[number];
}

export const ensure: Ensure = {
  string(value, name) {
    if (typeof value !== 'string') throw new AssertionError(`${name} must be a string`);
  },
  finiteNumber(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new AssertionError(`${name} must be a finite number`);
  },
  oneOf(value, allowed, name) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new AssertionError(`${name} must be one of ${allowed.join(', ')}`);
    }
  },
};

export type Publishable = Draft & { title: string; publishAt: Date };

export class Draft {
  title?: string;
  publishAt?: Date;

  /** Narrows the instance itself: afterwards `title` and `publishAt` are present. */
  assertPublishable(): asserts this is Publishable {
    if (!this.title) throw new AssertionError('a draft needs a title to publish');
    if (!this.publishAt) throw new AssertionError('a draft needs a publish date');
  }
}
