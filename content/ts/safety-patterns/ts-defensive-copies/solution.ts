const copy = (date: Date): Date => new Date(date.getTime());

/**
 * An immutable value object. `readonly Date[]` in a signature stops nobody
 * from calling `setHours` on one of the dates, so every Date is copied on the
 * way in and on the way out, and the internal array is never handed out.
 */
export class Schedule {
  readonly #name: string;
  readonly #times: readonly number[]; // epoch ms, sorted, unique: numbers cannot be mutated

  private constructor(name: string, times: readonly number[]) {
    this.#name = name;
    this.#times = times;
  }

  static create(name: string, slots: Iterable<Date>): Schedule {
    const times: number[] = [];
    for (const slot of slots) {
      const time = slot.getTime();
      if (Number.isNaN(time)) throw new RangeError('invalid date in schedule');
      times.push(time);
    }
    return new Schedule(name, normalise(times));
  }

  get name(): string {
    return this.#name;
  }

  /** Fresh copies, in a frozen array: callers can do what they like with them. */
  get slots(): readonly Date[] {
    return Object.freeze(this.#times.map((time) => new Date(time)));
  }

  get size(): number {
    return this.#times.length;
  }

  withSlot(slot: Date): Schedule {
    return Schedule.create(this.#name, [...this.slots, copy(slot)]);
  }

  withoutSlot(slot: Date): Schedule {
    const time = slot.getTime();
    return new Schedule(this.#name, this.#times.filter((t) => t !== time));
  }

  /** The first slot strictly after `after`, as a copy. */
  next(after: Date): Date | undefined {
    const time = this.#times.find((t) => t > after.getTime());
    return time === undefined ? undefined : new Date(time);
  }

  toJSON(): { name: string; slots: string[] } {
    return { name: this.#name, slots: this.#times.map((time) => new Date(time).toISOString()) };
  }
}

function normalise(times: number[]): number[] {
  return [...new Set(times)].sort((a, b) => a - b);
}
