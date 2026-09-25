export class InvalidValueError extends Error {
  constructor(type, input, reason) {
    super(`Invalid ${type} ${JSON.stringify(input)}: ${reason}`);
    this.name = 'InvalidValueError';
    this.type = type;
    this.input = input;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAddress {
  #value;

  constructor(value) {
    this.#value = value;
    Object.freeze(this);
  }

  /** The only way in: validate and normalise once, so every instance is valid. */
  static parse(input) {
    if (typeof input !== 'string') throw new InvalidValueError('EmailAddress', input, 'not a string');
    const value = input.trim().toLowerCase();
    if (!EMAIL.test(value)) throw new InvalidValueError('EmailAddress', input, 'not an email address');
    return new EmailAddress(value);
  }

  get value() { return this.#value; }
  get domain() { return this.#value.slice(this.#value.lastIndexOf('@') + 1); }
  equals(other) { return other instanceof EmailAddress && other.value === this.#value; }
  toString() { return this.#value; }
  toJSON() { return this.#value; }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' -> UTC midnight in ms, or null if it is not a real calendar date. */
function parseDate(text) {
  if (typeof text !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  // Date.UTC(2024, 1, 30) quietly becomes 1 March; reject anything that rolled over.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return ms;
}

/** A stay: `start` is the check-in date, `end` the check-out date (exclusive). */
export class DateRange {
  #start;
  #end;

  constructor(start, end) {
    this.#start = start;
    this.#end = end;
    Object.freeze(this);
  }

  static of(start, end) {
    const s = parseDate(start);
    const e = parseDate(end);
    if (s === null) throw new InvalidValueError('DateRange', { start, end }, 'start is not a YYYY-MM-DD date');
    if (e === null) throw new InvalidValueError('DateRange', { start, end }, 'end is not a YYYY-MM-DD date');
    if (e <= s) throw new InvalidValueError('DateRange', { start, end }, 'end must be after start');
    return new DateRange(start, end);
  }

  get start() { return this.#start; }
  get end() { return this.#end; }
  get nights() { return Math.round((parseDate(this.#end) - parseDate(this.#start)) / DAY_MS); }

  /** ISO dates compare correctly as strings. */
  contains(date) {
    if (parseDate(date) === null) throw new InvalidValueError('date', date, 'not a YYYY-MM-DD date');
    return date >= this.#start && date < this.#end;
  }

  overlaps(other) { return this.#start < other.end && other.start < this.#end; }
  withEnd(end) { return DateRange.of(this.#start, end); }
  equals(other) { return other instanceof DateRange && other.start === this.#start && other.end === this.#end; }
  toString() { return `${this.#start}/${this.#end}`; }
  toJSON() { return { start: this.#start, end: this.#end }; }
}
