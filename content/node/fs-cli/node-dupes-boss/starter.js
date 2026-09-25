import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const USAGE = 'usage: find-dupes [--json] [--min-size <bytes>] <dir>...\n';

export async function main(argv, io) {
  // TODO: parse argv (exit 2 on misuse), walk each directory, group by size,
  // hash only the sizes that repeat, print text or JSON, resolve 0 or 1.
  io.stderr.write('find-dupes: not implemented yet\n');
  return 70;
}
