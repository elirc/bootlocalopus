import { Readable } from 'node:stream';

const from = (chunks) => Readable.from(chunks.map((c) => Buffer.from(c)));

const collect = async (chunks) => {
  const out = [];
  for await (const record of from(chunks).pipe(solution.createNdjsonParser())) out.push(record);
  return out;
};

describe('createNdjsonParser', () => {
  it('parses one record per line', async () => {
    const out = await collect(['{"a":1}\n{"a":2}\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles a record split across chunks', async () => {
    const out = await collect(['{"name":"a', 'da","id":', '1}\n']);
    expect(out).toEqual([{ name: 'ada', id: 1 }]);
  });

  it('handles a newline arriving in its own chunk', async () => {
    const out = await collect(['{"a":1}', '\n', '{"a":2}\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('flushes a final line with no trailing newline', async () => {
    const out = await collect(['{"a":1}\n{"a":2}']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips blank lines', async () => {
    const out = await collect(['{"a":1}\n\n\n{"a":2}\n\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('tolerates Windows line endings', async () => {
    const out = await collect(['{"a":1}\r\n{"a":2}\r\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles an empty stream', async () => {
    expect(await collect([''])).toEqual([]);
  });

  it('emits an error for a malformed line', async () => {
    let caught;
    try {
      await collect(['{"a":1}\n{not json}\n{"a":3}\n']);
    } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.message).toContain('invalid json');
  });

  it('parses a large stream without buffering it whole', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => JSON.stringify({ i }) + '\n');
    const out = await collect(lines);
    expect(out).toHaveLength(500);
    expect(out[499]).toEqual({ i: 499 });
  });

  it('keeps a multibyte character intact when a chunk boundary splits it', async () => {
    const bytes = Buffer.from('{"name":"café"}\n{"name":"naïve ☕"}\n');
    const cut1 = bytes.indexOf(0xc3) + 1;              // between the two bytes of "é"
    const cut2 = bytes.lastIndexOf(0xe2) + 2;          // inside the three bytes of "☕"
    const chunks = [bytes.subarray(0, cut1), bytes.subarray(cut1, cut2), bytes.subarray(cut2)];
    const out = [];
    for await (const record of Readable.from(chunks).pipe(solution.createNdjsonParser())) out.push(record);
    expect(out).toEqual([{ name: 'café' }, { name: 'naïve ☕' }]);
  });

  it('emits objects, not strings', async () => {
    const out = await collect(['{"a":1}\n']);
    expect(typeof out[0]).toBe('object');
  });
});

describe('sumField', () => {
  it('sums a field across records', async () => {
    const source = from(['{"amount":10}\n{"amount":32}\n{"amount":0.5}\n']);
    expect(await solution.sumField(source, 'amount')).toBe(42.5);
  });

  it('treats a missing field as 0', async () => {
    const source = from(['{"amount":10}\n{"other":99}\n']);
    expect(await solution.sumField(source, 'amount')).toBe(10);
  });

  it('returns 0 for an empty source', async () => {
    expect(await solution.sumField(from(['']), 'amount')).toBe(0);
  });

  it('rejects on malformed input', async () => {
    await expect(solution.sumField(from(['{"amount":1}\noops\n']), 'amount')).rejects.toThrow();
  });

  it('rejects when the source itself fails', async () => {
    // A disk or socket error on the *source*. `.pipe()` does not forward it,
    // so a .pipe()-based sumField never settles; race it against a marker.
    const source = new Readable({ read() {} });
    source.push('{"amount":1}\n');
    setTimeout(() => source.destroy(new Error('disk read failed')), 10);
    let marker;
    const outcome = await Promise.race([
      solution.sumField(source, 'amount').then(() => 'resolved', (e) => e.message),
      new Promise((r) => { marker = setTimeout(() => r('never settled'), 2000); }),
    ]);
    clearTimeout(marker);
    expect(outcome).toBe('disk read failed');
  });
});