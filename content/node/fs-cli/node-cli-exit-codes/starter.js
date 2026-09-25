import { createReadStream } from 'node:fs';

export const USAGE = 'usage: count-lines [--total] <file>...\n';

export async function main(argv, io) {
  // TODO: validate argv (exit 2), count each file (stdout), report failures
  // (stderr) without stopping, and resolve 0 or 1.
  io.stderr.write('count-lines: not implemented yet\n');
  return 70;
}
