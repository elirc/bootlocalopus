import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

/** Pipeline stage: decompressed bytes in, lines out (no '\n', no trailing '\r'). */
async function* splitLines(source) {
  const decoder = new StringDecoder('utf8');
  let rest = '';
  const clean = (line) => (line.endsWith('\r') ? line.slice(0, -1) : line);
  for await (const chunk of source) {
    rest += decoder.write(chunk);
    let at;
    while ((at = rest.indexOf('\n')) !== -1) {
      yield clean(rest.slice(0, at));
      rest = rest.slice(at + 1);
    }
  }
  rest += decoder.end();
  if (rest !== '') yield clean(rest);
}

const isEvent = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof value.id === 'string' && value.id !== '' &&
  typeof value.type === 'string' && value.type !== '' &&
  Number.isInteger(value.ts);

export async function importEvents({ input, insert, rejects, batchSize = 100, signal }) {
  const stats = { lines: 0, inserted: 0, rejected: 0, duplicates: 0 };
  const seen = new Set();
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    signal?.throwIfAborted(); // an abort during the previous insert stops this one
    const full = batch;
    batch = [];
    await insert(full);
    stats.inserted += full.length;
  };

  const reject = async (lineNumber, reason, line) => {
    stats.rejected++;
    if (!rejects.write(`${lineNumber}\t${reason}\t${line}\n`)) await once(rejects, 'drain');
  };

  async function consume(lines) {
    for await (const line of lines) {
      const lineNumber = ++stats.lines;
      if (line === '') continue;
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        await reject(lineNumber, 'invalid json', line);
        continue;
      }
      if (!isEvent(value)) {
        await reject(lineNumber, 'invalid event', line);
        continue;
      }
      if (seen.has(value.id)) {
        stats.duplicates++;
        continue;
      }
      seen.add(value.id);
      batch.push(value);
      if (batch.length >= batchSize) await flush();
    }
    await flush();
  }

  // pipeline destroys every stage on the first error, including an abort.
  await pipeline(input, createGunzip(), splitLines, consume, { signal });
  return stats;
}
