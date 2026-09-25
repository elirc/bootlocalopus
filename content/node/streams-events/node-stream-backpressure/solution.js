import { once } from 'node:events';
import { finished } from 'node:stream/promises';

export async function writeAll(writable, source) {
  let count = 0;
  try {
    for await (const chunk of source) {
      if (writable.destroyed) throw writable.errored ?? new Error('stream destroyed');
      count++;
      if (!writable.write(chunk)) {
        // once() rejects if 'error' fires first, so a failing stream cannot hang us.
        await once(writable, 'drain');
      }
    }
  } catch (error) {
    // Source failed, or the stream did: make sure the destination is not left half-open.
    writable.destroy(error);
    throw writable.errored ?? error;
  }
  writable.end();
  await finished(writable); // resolves on 'finish', rejects on 'error'
  return count;
}
