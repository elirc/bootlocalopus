export class InvalidValueError extends Error {}

// Today these are plain strings and plain objects, validated (or not) in
// every handler that touches them.

export class EmailAddress {
  static parse(input) {
    throw new Error('TODO');
  }
}

export class DateRange {
  static of(start, end) {
    throw new Error('TODO');
  }
}
