// "Immutable" by declaration only. It keeps the caller's array and Date
// objects, hands its own array out, and `withSlot` mutates in place.

export class Schedule {
  readonly name: string;
  readonly slots: Date[];

  private constructor(name: string, slots: Date[]) {
    this.name = name;
    this.slots = slots;
  }

  static create(name: string, slots: Iterable<Date>): Schedule {
    const list = Array.isArray(slots) ? slots : [...slots];
    list.sort((a, b) => a.getTime() - b.getTime());
    return new Schedule(name, list);
  }

  get size(): number {
    return this.slots.length;
  }

  withSlot(slot: Date): Schedule {
    this.slots.push(slot);
    this.slots.sort((a, b) => a.getTime() - b.getTime());
    return this;
  }

  withoutSlot(slot: Date): Schedule {
    return new Schedule(this.name, this.slots.filter((s) => s !== slot));
  }

  next(after: Date): Date | undefined {
    return this.slots.find((s) => s > after);
  }

  toJSON(): { name: string; slots: string[] } {
    return { name: this.name, slots: this.slots.map((s) => s.toISOString()) };
  }
}
