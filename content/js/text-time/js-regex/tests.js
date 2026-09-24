const { parseLogLine, isSlug, countEmoji, highlight } = solution;

const LINE = '203.0.113.7 - alice [10/Oct/2025:13:55:36 +0200] "GET /api/orders?page=2 HTTP/1.1" 200 2326 "https://shop.example/cart" "Mozilla/5.0 (X11; Linux x86_64)"';

describe('parseLogLine', () => {
  it('parses a full line into the exact shape', () => {
    expect(parseLogLine(LINE)).toStrictEqual({
      ip: '203.0.113.7',
      user: 'alice',
      time: '2025-10-10T11:55:36.000Z',
      method: 'GET',
      path: '/api/orders?page=2',
      protocol: 'HTTP/1.1',
      status: 200,
      bytes: 2326,
      referrer: 'https://shop.example/cart',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    });
  });

  it('maps "-" to null for user, referrer and user agent, and to 0 for bytes', () => {
    const r = parseLogLine('198.51.100.4 - - [01/Jan/2026:00:00:00 +0000] "HEAD /health HTTP/1.0" 204 - "-" "-"');
    expect(r).toStrictEqual({
      ip: '198.51.100.4', user: null, time: '2026-01-01T00:00:00.000Z', method: 'HEAD', path: '/health',
      protocol: 'HTTP/1.0', status: 204, bytes: 0, referrer: null, userAgent: null,
    });
  });

  it('accepts IPv6 and a negative offset (converted to UTC across midnight)', () => {
    const r = parseLogLine('2001:db8::1 - bob [31/Dec/2025:22:30:00 -0430] "POST /api/orders HTTP/2" 201 17 "-" "curl/8.5.0"');
    expect(r.ip).toBe('2001:db8::1');
    expect(r.time).toBe('2026-01-01T03:00:00.000Z');
    expect(r.protocol).toBe('HTTP/2');
    expect(r.status).toBe(201);
    expect(r.userAgent).toBe('curl/8.5.0');
  });

  it('gives the same answer on every call (no state carried between calls)', () => {
    const results = [parseLogLine(LINE), parseLogLine(LINE), parseLogLine(LINE)];
    for (const r of results) {
      expect(r).not.toBeNull();
      expect(r.status).toBe(200);
    }
  });

  it('returns null for lines that do not match in full', () => {
    const bad = [
      '',
      'garbage',
      LINE.slice(0, 60),                                   // truncated
      LINE + ' extra',                                     // trailing junk
      ' ' + LINE,                                          // leading junk
      LINE.replace('" 200 ', '" 20 '),                     // two-digit status
      LINE.replace('" 200 ', '" 2000 '),                   // four-digit status
      LINE.replace('/Oct/', '/Foo/'),                      // unknown month
      LINE.replace('+0200]', '+02:00]'),                   // malformed offset
      LINE.replace('2326', '12kb'),                        // bytes not a number
    ];
    for (const line of bad) expect(parseLogLine(line)).toBeNull();
  });
});

describe('isSlug', () => {
  it('accepts valid slugs', () => {
    for (const s of ['hello', 'hello-world', 'a1-b2-c3', '2025-roadmap', 'x']) expect(isSlug(s)).toBe(true);
  });

  it('rejects hyphens in the wrong places', () => {
    for (const s of ['', '-', '-a', 'a-', 'a--b', 'abc-']) expect(isSlug(s)).toBe(false);
  });

  it('rejects uppercase, accents, underscores, spaces and newlines', () => {
    for (const s of ['Hello', 'héllo', 'a_b', 'a b', 'abc\n', '\nabc', 'ab\ncd']) expect(isSlug(s)).toBe(false);
  });

  it('a non-string is not a slug', () => {
    for (const v of [42, null, undefined, ['abc'], { toString: () => 'abc' }]) expect(isSlug(v)).toBe(false);
  });

  it('accepts a valid 100,000-character slug', () => {
    expect(isSlug('ab-'.repeat(33_333) + 'z')).toBe(true);
  });

  // Placed last in its group: a catastrophic pattern blocks the thread, so the
  // time is checked between inputs of growing length and the test stops as soon
  // as it starts to explode (each extra character doubles a bad pattern's work).
  it('does not backtrack catastrophically on hostile input', () => {
    const families = [(n) => 'a'.repeat(n) + '!', (n) => 'a1'.repeat(n) + '-!', (n) => 'ab-'.repeat(n) + '-'];
    const started = Date.now();
    for (let n = 10; n <= 40; n++) {
      for (const make of families) {
        const input = make(n);
        const t0 = Date.now();
        const result = isSlug(input);
        const step = Date.now() - t0;
        const total = Date.now() - started;
        if (step > 500 || total > 2000) {
          fail(`isSlug took ${step} ms on the ${input.length}-character input ${JSON.stringify(input.slice(0, 12) + '…')} (${total} ms so far). The time is growing exponentially with length: the pattern backtracks catastrophically.`);
        }
        expect(result).toBe(false);
      }
    }
    const t0 = Date.now();
    expect(isSlug('a'.repeat(100_000) + '!')).toBe(false);
    const big = Date.now() - t0;
    if (big > 2000) fail(`isSlug took ${big} ms on a 100,001-character hostile input`);
  });
});

describe('countEmoji', () => {
  it('counts nothing in plain text', () => {
    expect(countEmoji('')).toBe(0);
    expect(countEmoji('ship it')).toBe(0);
  });
  it('does not count digits, # or * (they carry the Emoji property)', () => {
    expect(countEmoji('order #1234 * 3 items')).toBe(0);
  });
  it('does not count a text-style copyright sign', () => {
    expect(countEmoji('© 2025 Acme')).toBe(0);
  });
  it('counts a skin-toned emoji as one', () => {
    expect(countEmoji('👍🏽')).toBe(1);
  });
  it('counts a ZWJ family as one', () => {
    expect(countEmoji('👨‍👩‍👧')).toBe(1);
  });
  it('counts flags and keycaps as one each', () => {
    expect(countEmoji('🇬🇧🇺🇸')).toBe(2);
    expect(countEmoji('1️⃣ then 2️⃣')).toBe(2);
  });
  it('counts a mixed sentence', () => {
    expect(countEmoji('👍🏽 ship it 👨‍👩‍👧 in 3 days ❤️')).toBe(3);
  });
});

describe('highlight', () => {
  it('keeps the original casing of every occurrence', () => {
    expect(highlight('A+B and a+b', 'a+b')).toBe('<mark>A+B</mark> and <mark>a+b</mark>');
  });
  it('treats . as a literal dot', () => {
    expect(highlight('$5.00 or 5x00', '5.00')).toBe('$<mark>5.00</mark> or 5x00');
  });
  it('treats brackets and parentheses as literals', () => {
    expect(highlight('call fn() now', 'fn()')).toBe('call <mark>fn()</mark> now');
    expect(highlight('[x] done, [ ] todo', '[x]')).toBe('<mark>[x]</mark> done, [ ] todo');
    expect(highlight('a|b or ab', 'a|b')).toBe('<mark>a|b</mark> or ab');
  });
  it('treats $ and backslash as literals', () => {
    expect(highlight('costs $& more', '$&')).toBe('costs <mark>$&</mark> more');
    expect(highlight('C:\\temp\\x', '\\temp')).toBe('C:<mark>\\temp</mark>\\x');
  });
  it('matches case-insensitively beyond ASCII', () => {
    expect(highlight('CAFÉ and café', 'café')).toBe('<mark>CAFÉ</mark> and <mark>café</mark>');
  });
  it('does not overlap matches', () => {
    expect(highlight('aaa', 'aa')).toBe('<mark>aa</mark>a');
  });
  it('an empty term leaves the text alone', () => {
    expect(highlight('nothing to see', '')).toBe('nothing to see');
  });
});
