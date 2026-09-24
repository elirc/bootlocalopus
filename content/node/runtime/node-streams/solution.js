import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';

export function createNdjsonParser() {
  let buffer = '';
  // Chunks split bytes, not characters: "é" is two bytes and can straddle a
  // chunk boundary. The decoder holds an incomplete sequence back until the
  // rest arrives; `chunk.toString()` would turn each half into U+FFFD.
  const decoder = new StringDecoder('utf8');

  const emit = (stream, line, callback) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    try {
      stream.push(JSON.parse(trimmed));
      return true;
    } catch {
      callback(new Error('invalid json on line: ' + trimmed.slice(0, 60)));
      return false;
    }
  };

  return new Transform({
    readableObjectMode: true,

    transform(chunk, _encoding, callback) {
      buffer += decoder.write(chunk);
      const lines = buffer.split('\n');
      // The last element is an incomplete line (or ''), so hold it back.
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!emit(this, line, callback)) return;
      }
      callback();
    },

    flush(callback) {
      buffer += decoder.end();
      if (buffer.trim()) {
        if (!emit(this, buffer, callback)) return;
      }
      buffer = '';
      callback();
    },
  });
}

export async function sumField(source, field) {
  let total = 0;
  // pipeline, not .pipe(): it forwards an error from *any* stage (including
  // the source) to the caller, destroys the others, and respects backpressure.
  // With .pipe(), a source error never reaches the parser and this hangs.
  await pipeline(source, createNdjsonParser(), async (records) => {
    for await (const record of records) total += record[field] ?? 0;
  });
  return total;
}
