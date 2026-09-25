const HOUR = 3_600_000;
const MINUTE = 60_000;
const SECOND = 1_000;

describe('parseDuration: valid input', () => {
  const valid = [
    ['2h', 2 * HOUR],
    ['5m', 5 * MINUTE],
    ['90s', 90 * SECOND],
    ['250ms', 250],
    ['0s', 0],
    ['1h30m', HOUR + 30 * MINUTE],
    ['2m15s', 2 * MINUTE + 15 * SECOND],
    ['1h2m3s4ms', HOUR + 2 * MINUTE + 3 * SECOND + 4],
    ['1H30M', HOUR + 30 * MINUTE],
    ['250MS', 250],
    ['  45s  ', 45 * SECOND],
  ];

  for (const [input, ms] of valid) {
    it(`parses ${JSON.stringify(input)} as ${ms} ms`, () => {
      expect(solution.parseDuration(input)).toBe(ms);
    });
  }
});

describe('parseDuration: invalid input returns null', () => {
  const invalid = [
    '',
    '   ',
    'abc',
    'h',
    '10',
    '10x',
    '10s!',
    'in 10s',
    '1.5h',
    '-5s',
    '1h1h',     // same unit twice
    '30m1h',    // wrong order
    '5s2m',     // wrong order
    '1h 30m',   // no spaces between parts
  ];

  for (const input of invalid) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(solution.parseDuration(input)).toBe(null);
    });
  }
});
