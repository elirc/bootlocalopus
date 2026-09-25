import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Feeds chunks (strings become UTF-8 Buffers) through a fresh parser; resolves the records. */
const parse = async (chunks, options) => {
  const out = [];
  await pipeline(
    Readable.from(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))),
    solution.createCsvParser(options),
    new Writable({ objectMode: true, write(record, _e, cb) { out.push(record); cb(); } }),
  );
  return out;
};

/** Every way of cutting `text` into two chunks, plus one byte at a time. */
const splits = (text) => {
  const bytes = Buffer.from(text);
  const ways = [[bytes]];
  for (let i = 1; i < bytes.length; i++) ways.push([bytes.subarray(0, i), bytes.subarray(i)]);
  ways.push([...bytes].map((b) => Buffer.from([b])));
  return ways;
};

const parseError = async (chunks, options) => {
  try {
    await parse(chunks, options);
  } catch (e) {
    return e;
  }
  return null;
};

describe('createCsvParser', () => {
  it('parses a simple file into objects keyed by the header', async () => {
    expect(await parse(['id,name\n1,Ada\n2,Grace\n'])).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Grace' },
    ]);
  });

  it('handles quoted commas, doubled quotes and newlines inside quotes', async () => {
    const text = 'id,name,notes\n7,"Smith, Jane","said ""call me"" on\nthe phone"\n8,"",plain\n';
    expect(await parse([text])).toEqual([
      { id: '7', name: 'Smith, Jane', notes: 'said "call me" on\nthe phone' },
      { id: '8', name: '', notes: 'plain' },
    ]);
  });

  it('keeps empty fields and does not trim', async () => {
    expect(await parse(['a,b,c\n, x ,\n'])).toEqual([{ a: '', b: ' x ', c: '' }]);
  });

  it('accepts \\r\\n line endings and a last record without a newline', async () => {
    expect(await parse(['id,v\r\n1,a\r\n2,"b\r\nc"\r\n3,d'])).toEqual([
      { id: '1', v: 'a' },
      { id: '2', v: 'b\r\nc' },
      { id: '3', v: 'd' },
    ]);
  });

  it('gives the same result however the input is chunked', async () => {
    const text = 'id,name,note\r\n1,"Zoë, the ""best""","x\ny"\r\n\r\n2,Łukasz,☕\r\n';
    const expected = [
      { id: '1', name: 'Zoë, the "best"', note: 'x\ny' },
      { id: '2', name: 'Łukasz', note: '☕' },
    ];
    for (const chunks of splits(text)) {
      const got = await parse(chunks);
      expect({ at: chunks.map((c) => c.length), got }).toEqual({ at: chunks.map((c) => c.length), got: expected });
    }
  });

  it('skips blank lines', async () => {
    expect(await parse(['\nid\n\n1\n\n\n2\n'])).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('drops a leading byte-order mark', async () => {
    const rows = await parse([Buffer.from([0xef, 0xbb]), Buffer.from([0xbf]), 'id,name\n1,x\n']);
    expect(rows).toEqual([{ id: '1', name: 'x' }]);
    expect(Object.keys(rows[0])[0]).toBe('id');
  });

  it('pushes arrays when header is false', async () => {
    expect(await parse(['a,"b,c"\n\nd,e,f\n'], { header: false })).toEqual([['a', 'b,c'], ['d', 'e', 'f']]);
  });

  it('fails with CsvError and the record number on a wrong field count', async () => {
    const e = await parseError(['id,name\n1,Ada\n\n2,"Grace\nHopper",extra\n3,Linus\n']);
    expect(e).toBeInstanceOf(solution.CsvError);
    expect(e.name).toBe('CsvError');
    expect(e.row).toBe(3);
  });

  it('fails with CsvError on an unterminated quote at the end of input', async () => {
    const e = await parseError(['id,name\n1,Ada\n2,"Grace\n', 'Hopper\n']);
    expect(e).toBeInstanceOf(solution.CsvError);
    expect(e.row).toBe(3);
  });

  it('emits a record as soon as it is complete, without waiting for the end', async () => {
    const parser = solution.createCsvParser();
    const seen = [];
    parser.on('data', (r) => seen.push(r));
    parser.write('id,name\n1,Ada\n2,Gr');
    await new Promise((r) => setImmediate(r));
    expect(seen).toEqual([{ id: '1', name: 'Ada' }]);
    parser.end('ace\n');
    await new Promise((r) => parser.on('end', r));
    expect(seen).toEqual([{ id: '1', name: 'Ada' }, { id: '2', name: 'Grace' }]);
  });
});
