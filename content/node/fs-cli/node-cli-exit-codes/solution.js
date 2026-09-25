import { createReadStream } from 'node:fs';

export const USAGE = 'usage: count-lines [--total] <file>...\n';

const REASONS = { ENOENT: 'no such file', EISDIR: 'is a directory' };

/** Counts '\n' bytes as they stream past, plus a final unterminated line. */
async function countLines(stream) {
  let count = 0;
  let last = 0x0a; // an empty input ends "as if" on a newline: 0 lines
  for await (const chunk of stream) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    if (buf.length === 0) continue;
    for (let i = buf.indexOf(0x0a); i !== -1; i = buf.indexOf(0x0a, i + 1)) count++;
    last = buf[buf.length - 1];
  }
  return last === 0x0a ? count : count + 1;
}

export async function main(argv, io) {
  const files = [];
  let total = false;
  for (const arg of argv) {
    if (arg === '--help') {
      io.stdout.write(USAGE);
      return 0;
    }
    if (arg === '--total') total = true;
    else if (arg.startsWith('--')) {
      io.stderr.write(`count-lines: unknown option '${arg}'\n${USAGE}`);
      return 2;
    } else files.push(arg);
  }
  if (files.length === 0) {
    io.stderr.write(USAGE);
    return 2;
  }

  let sum = 0;
  let failed = false;
  for (const file of files) {
    try {
      const n = await countLines(file === '-' ? io.stdin : createReadStream(file));
      sum += n;
      io.stdout.write(`${n}\t${file}\n`);
    } catch (error) {
      failed = true; // remember, but keep going: the other files still count
      io.stderr.write(`count-lines: ${file}: ${REASONS[error.code] ?? error.message}\n`);
    }
  }
  if (total) io.stdout.write(`${sum}\ttotal\n`);
  return failed ? 1 : 0;
}
