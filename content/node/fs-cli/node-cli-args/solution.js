import { parseArgs } from 'node:util';

const OPTIONS = {
  format: { type: 'string', short: 'f', default: 'csv' },
  limit: { type: 'string', short: 'n' },
  since: { type: 'string' },
  tag: { type: 'string', multiple: true },
  verbose: { type: 'boolean', short: 'v', default: false },
  'dry-run': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

const FORMATS = ['csv', 'json'];

function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  // Date rolls 2024-02-30 over to 2024-03-01; a real date round-trips.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export function parseCliArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    // parseArgs names the option in its message ("Unknown option '--dryrun'",
    // "Option '-n, --limit <value>' argument missing").
    return { ok: false, error: error.message };
  }
  const { values, positionals } = parsed;
  const fail = (error) => ({ ok: false, error });

  const value = {
    output: positionals[0] ?? null,
    format: values.format,
    limit: null,
    since: values.since ?? null,
    tags: values.tag ?? [], // a `default: []` here would be one array shared by every call
    verbose: values.verbose,
    dryRun: values['dry-run'],
    help: values.help,
  };
  if (value.help) return { ok: true, value };

  if (!FORMATS.includes(value.format)) {
    return fail(`invalid --format "${value.format}": expected ${FORMATS.join(' or ')}`);
  }
  if (values.limit !== undefined) {
    if (!/^[1-9]\d*$/.test(values.limit)) {
      return fail(`invalid --limit "${values.limit}": expected a whole number of at least 1`);
    }
    value.limit = Number(values.limit);
  }
  if (value.since !== null && !isRealDate(value.since)) {
    return fail(`invalid --since "${value.since}": expected a date as YYYY-MM-DD`);
  }
  if (positionals.length !== 1) {
    return fail(`expected exactly one output file, got ${positionals.length}`);
  }
  return { ok: true, value };
}
