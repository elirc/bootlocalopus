import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const USAGE = 'usage: find-dupes [--json] [--min-size <bytes>] <dir>...\n';
const SKIP_DIRS = new Set(['node_modules', '.git']);

class UsageError extends Error {}

function parse(argv) {
  const opts = { json: false, minSize: 1, help: false, dirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') opts.help = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--min-size' || arg.startsWith('--min-size=')) {
      const value = arg === '--min-size' ? argv[++i] : arg.slice('--min-size='.length);
      if (value === undefined || !/^\d+$/.test(value)) {
        throw new UsageError('find-dupes: --min-size must be a non-negative integer\n');
      }
      opts.minSize = Number(value);
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new UsageError(`find-dupes: unknown option '${arg}'\n`);
    } else opts.dirs.push(arg);
  }
  return opts;
}

/** Yields { display, abs } for every regular file below dir. */
async function* walk(dir, display) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const shown = `${display}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(abs, shown);
    } else if (entry.isFile()) {
      yield { display: shown, abs };
    }
  }
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export async function main(argv, io) {
  let opts;
  try {
    opts = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr.write(error.message + USAGE);
    return 2;
  }
  if (opts.help) {
    io.stdout.write(USAGE);
    return 0;
  }
  if (opts.dirs.length === 0) {
    io.stderr.write(USAGE);
    return 2;
  }

  let failed = false;
  const seen = new Set(); // resolved absolute paths: a file counts once
  const bySize = new Map(); // size -> [{ display, abs }]

  for (const dir of opts.dirs) {
    try {
      const info = await stat(dir);
      if (!info.isDirectory()) {
        failed = true;
        io.stderr.write(`find-dupes: ${dir}: not a directory\n`);
        continue;
      }
      for await (const file of walk(dir, dir)) {
        const key = path.resolve(file.abs);
        if (seen.has(key)) continue;
        seen.add(key);
        const { size } = await stat(file.abs);
        if (size < opts.minSize) continue;
        if (!bySize.has(size)) bySize.set(size, []);
        bySize.get(size).push(file);
      }
    } catch (error) {
      failed = true;
      const reason = error.code === 'ENOENT' ? 'no such directory' : error.message;
      io.stderr.write(`find-dupes: ${dir}: ${reason}\n`);
    }
  }

  const groups = [];
  for (const [size, files] of bySize) {
    if (files.length < 2) continue; // a unique size cannot have a duplicate: never read it
    const byHash = new Map();
    for (const file of files) {
      const digest = await hashFile(file.abs);
      if (!byHash.has(digest)) byHash.set(digest, []);
      byHash.get(digest).push(file.display);
    }
    for (const paths of byHash.values()) {
      if (paths.length > 1) groups.push({ size, paths: paths.sort(byString) });
    }
  }
  groups.sort((a, b) => b.size - a.size || byString(a.paths[0], b.paths[0]));
  const wastedBytes = groups.reduce((sum, g) => sum + g.size * (g.paths.length - 1), 0);

  if (opts.json) {
    io.stdout.write(JSON.stringify({ groups, wastedBytes }) + '\n');
  } else if (groups.length === 0) {
    io.stdout.write('no duplicates\n');
  } else {
    const blocks = groups.map((g) =>
      `${g.size} bytes, ${g.paths.length} copies:\n` + g.paths.map((p) => `  ${p}\n`).join(''));
    io.stdout.write(`${blocks.join('\n')}\n${groups.length} duplicate groups, ${wastedBytes} bytes wasted\n`);
  }
  return failed ? 1 : 0;
}
