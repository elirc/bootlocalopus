const U1 = '3f2b8c1e-9d4a-4b7e-8f21-5c6d7e8f9a0b';
const U2 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const U3 = '0f0e0d0c-0b0a-4908-8706-050403020100';

describe('scrub: timestamps', () => {
  it('replaces whole-string ISO timestamps, with or without milliseconds and offset', () => {
    expect(solution.scrub({
      a: '2024-05-01T09:30:00.000Z',
      b: '2024-05-01T09:30:00Z',
      c: '2024-05-01T10:30:00+01:00',
      d: '2024-05-01T10:30:00.123456-05:00',
    })).toEqual({ a: '<timestamp>', b: '<timestamp>', c: '<timestamp>', d: '<timestamp>' });
  });

  it('replaces Date objects', () => {
    expect(solution.scrub({ at: new Date('2024-05-01T09:30:00Z') })).toEqual({ at: '<timestamp>' });
  });

  it('leaves dates and text that are not full timestamps alone', () => {
    const input = { day: '2024-05-01', note: 'shipped 2024-05-01T09:30:00Z', time: '09:30' };
    expect(solution.scrub(input)).toEqual(input);
  });
});

describe('scrub: UUIDs', () => {
  it('numbers UUIDs by first appearance, and the same UUID keeps its number', () => {
    const out = solution.scrub({ a: U1, b: { c: U2, d: U1 }, e: [U3, U2] });
    expect(out).toEqual({ a: '<uuid-1>', b: { c: '<uuid-2>', d: '<uuid-1>' }, e: ['<uuid-3>', '<uuid-2>'] });
  });

  it('numbers in sorted-key order, so insertion order does not change the snapshot', () => {
    const one = solution.scrub({ z: U1, a: U2 });
    const two = solution.scrub({ a: U2, z: U1 });
    expect(one).toEqual({ a: '<uuid-1>', z: '<uuid-2>' });
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it('matches UUIDs case-insensitively, as the same value', () => {
    expect(solution.scrub([U1, U1.toUpperCase()])).toEqual(['<uuid-1>', '<uuid-1>']);
  });

  it('replaces UUIDs inside longer strings', () => {
    expect(solution.scrub({ link: `/orders/${U1}/lines/${U2}`, self: `/orders/${U1}` })).toEqual({
      link: '/orders/<uuid-1>/lines/<uuid-2>',
      self: '/orders/<uuid-1>',
    });
  });

  it('starts numbering again on every call', () => {
    solution.scrub({ a: U1, b: U2 });
    expect(solution.scrub({ x: U3 })).toEqual({ x: '<uuid-1>' });
  });
});

describe('scrub: structure', () => {
  it('sorts object keys at every depth and keeps array order', () => {
    const out = solution.scrub({ b: 1, a: { d: [3, 1, 2], c: true } });
    expect(JSON.stringify(out)).toBe('{"a":{"c":true,"d":[3,1,2]},"b":1}');
  });

  it('keeps numbers, booleans, null and plain strings as they are', () => {
    const input = { n: 0, f: 1.5, t: true, nil: null, s: 'hello', list: [] };
    expect(solution.scrub(input)).toEqual(input);
  });

  it('does not modify its input', () => {
    const input = { id: U1, at: '2024-05-01T09:30:00Z', token: 'secret', nested: { z: 1, a: 2 } };
    const before = JSON.stringify(input);
    solution.scrub(input, { redact: ['token'] });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('works on a bare string or array at the top level', () => {
    expect(solution.scrub(U1)).toBe('<uuid-1>');
    expect(solution.scrub(['2024-05-01T09:30:00Z', 'x'])).toEqual(['<timestamp>', 'x']);
  });
});

describe('scrub: redaction', () => {
  it('redacts listed keys at any depth, whatever their value', () => {
    const out = solution.scrub(
      { user: { name: 'Kim', password: 'hunter2', sessions: [{ token: { raw: 'abc' } }] }, token: null },
      { redact: ['password', 'token'] },
    );
    expect(out).toEqual({ token: '<redacted>', user: { name: 'Kim', password: '<redacted>', sessions: [{ token: '<redacted>' }] } });
  });

  it('does not number a UUID that only appears under a redacted key', () => {
    const out = solution.scrub({ a: { secret: U1 }, b: U2 }, { redact: ['secret'] });
    expect(out).toEqual({ a: { secret: '<redacted>' }, b: '<uuid-1>' });
  });

  it('redacts nothing by default', () => {
    expect(solution.scrub({ password: 'x' })).toEqual({ password: 'x' });
  });
});

describe('scrub: a real API response', () => {
  it('produces a stable snapshot', () => {
    const response = {
      order: { id: U1, createdAt: new Date('2024-05-01T09:30:00Z'), customerId: U2, links: { self: `/orders/${U1}` } },
      customer: { id: U2, apiKey: 'sk_live_123', email: 'kim@example.com' },
    };
    expect(solution.scrub(response, { redact: ['apiKey'] })).toEqual({
      customer: { apiKey: '<redacted>', email: 'kim@example.com', id: '<uuid-1>' },
      order: { createdAt: '<timestamp>', customerId: '<uuid-1>', id: '<uuid-2>', links: { self: '/orders/<uuid-2>' } },
    });
  });
});
