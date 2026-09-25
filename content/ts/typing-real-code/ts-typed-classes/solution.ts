export interface Entity {
  id: string;
}

/** Shared storage and lookup; each subclass supplies its own validation. */
export abstract class Repository<T extends Entity> {
  protected readonly items = new Map<string, T>();

  /** Throws when `item` is not valid. Subclasses must implement it. */
  protected abstract validate(item: T): void;

  save(item: T): T {
    this.validate(item);
    this.items.set(item.id, item);
    return item;
  }

  find(id: string): T | undefined {
    return this.items.get(id);
  }

  all(): readonly T[] {
    return [...this.items.values()];
  }
}

export interface User extends Entity {
  email: string;
}

export class UserRepository extends Repository<User> {
  protected validate(user: User): void {
    if (!user.email.includes('@')) throw new Error(`invalid email: ${user.email}`);
  }

  findByEmail(email: string): User | undefined {
    for (const user of this.items.values()) if (user.email === email) return user;
    return undefined;
  }
}

/**
 * A private constructor forces every Money through `fromCents`, which checks
 * it. The `#cents` field makes the class nominal: a look-alike object literal
 * has no `#cents` and is not a Money.
 */
export class Money {
  readonly #cents: number;

  private constructor(cents: number) {
    this.#cents = cents;
  }

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) throw new RangeError(`cents must be an integer, got ${cents}`);
    return new Money(cents);
  }

  get cents(): number {
    return this.#cents;
  }

  plus(other: Money): Money {
    return new Money(this.#cents + other.#cents);
  }

  equals(other: Money): boolean {
    return this.#cents === other.#cents;
  }
}

export interface Clock {
  now(): Date;
}

export class FixedClock implements Clock {
  readonly #at: Date;

  constructor(at: Date) {
    this.#at = at;
  }

  now(): Date {
    return new Date(this.#at.getTime());
  }
}
