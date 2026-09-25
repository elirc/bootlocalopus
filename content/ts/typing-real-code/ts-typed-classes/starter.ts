// Ported from JavaScript as-is: everything is public, anything can be
// constructed, and the compiler can enforce none of the class's rules.

export interface Entity {
  id: string;
}

export class Repository<T> {
  items = new Map<string, T>();

  validate(item: T): void {
    // subclasses are supposed to override this
  }

  save(item: T): T {
    this.validate(item);
    this.items.set((item as any).id, item);
    return item;
  }

  find(id: string): T | undefined {
    return this.items.get(id);
  }

  all(): T[] {
    return [...this.items.values()];
  }
}

export interface User extends Entity {
  email: string;
}

export class UserRepository extends Repository<User> {
  validate(user: User): void {
    if (!user.email.includes('@')) throw new Error(`invalid email: ${user.email}`);
  }

  findByEmail(email: string): User | undefined {
    for (const user of this.items.values()) if (user.email === email) return user;
    return undefined;
  }
}

export class Money {
  cents: number;

  constructor(cents: number) {
    this.cents = cents;
  }

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) throw new RangeError(`cents must be an integer, got ${cents}`);
    return new Money(cents);
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}

export interface Clock {
  now(): Date;
}

export class FixedClock {
  at?: Date;

  constructor(at?: Date) {
    this.at = at;
  }

  now() {
    return new Date(this.at!.getTime());
  }
}
