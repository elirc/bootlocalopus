const parse = (...argv) => solution.parseCliArgs(argv);

const ok = (...argv) => {
  const r = parse(...argv);
  if (!r || r.ok !== true) throw new Error(`expected ${JSON.stringify(argv)} to parse, got ${JSON.stringify(r)}`);
  return r.value;
};

const bad = (argv, mention) => {
  let r;
  try {
    r = solution.parseCliArgs(argv);
  } catch (e) {
    throw new Error(`parseCliArgs(${JSON.stringify(argv)}) threw (${e.message}); it must return { ok: false, error }`);
  }
  expect(r.ok).toBe(false);
  expect(typeof r.error).toBe('string');
  expect(r.error).toContain(mention);
};

const DEFAULTS = { format: 'csv', limit: null, since: null, tags: [], verbose: false, dryRun: false, help: false };

describe('parseCliArgs: valid input', () => {
  it('applies the defaults', () => {
    expect(ok('users.csv')).toStrictEqual({ output: 'users.csv', ...DEFAULTS });
  });

  it('accepts - as the output', () => {
    expect(ok('-').output).toBe('-');
  });

  it('reads long, =, and short forms', () => {
    expect(ok('--format', 'json', 'out.json').format).toBe('json');
    expect(ok('--format=json', 'out.json').format).toBe('json');
    expect(ok('-f', 'json', 'out.json').format).toBe('json');
  });

  it('turns --limit into a number', () => {
    expect(ok('--limit', '25', 'o').limit).toBe(25);
    expect(ok('--limit=7', 'o').limit).toBe(7);
    expect(ok('-n', '100', 'o').limit).toBe(100);
  });

  it('collects repeated --tag values', () => {
    expect(ok('--tag', 'admin', 'o', '--tag', 'beta').tags).toEqual(['admin', 'beta']);
  });

  it('reads booleans, including grouped short flags', () => {
    const v = ok('-vn', '5', '--dry-run', 'o');
    expect(v.verbose).toBe(true);
    expect(v.limit).toBe(5);
    expect(v.dryRun).toBe(true);
  });

  it('keeps a valid --since as a string', () => {
    expect(ok('--since', '2024-02-29', 'o').since).toBe('2024-02-29');
  });

  it('treats everything after -- as positional', () => {
    expect(ok('--verbose', '--', '--weird-name.csv').output).toBe('--weird-name.csv');
  });

  it('with --help, needs no output file', () => {
    const v = ok('--help');
    expect(v.help).toBe(true);
    expect(v.output).toBeNull();
    expect(ok('-h').help).toBe(true);
  });

  it('returns a fresh tags array each time', () => {
    ok('o').tags.push('leak');
    expect(ok('o').tags).toEqual([]);
  });
});

describe('parseCliArgs: rejections', () => {
  it('rejects unknown options, naming them', () => {
    bad(['--dryrun', 'o'], '--dryrun');
    bad(['--no-verbose', 'o'], '--no-verbose');
  });

  it('rejects a missing --limit value', () => {
    bad(['o', '--limit'], '--limit');
    bad(['--limit=', 'o'], '--limit');
  });

  for (const v of ['abc', '0', '1.5', '10abc', '1e3', ' 5', '5 ', '0x10']) {
    it(`rejects --limit ${JSON.stringify(v)}`, () => bad(['--limit', v, 'o'], '--limit'));
  }

  it('names --limit even when the user typed -n', () => {
    bad(['-n', 'lots', 'o'], '--limit');
  });

  it('rejects a negative --limit', () => {
    bad(['--limit=-3', 'o'], '--limit');
  });

  it('rejects an unknown --format', () => {
    bad(['--format', 'xml', 'o'], '--format');
    bad(['-f', 'CSV ', 'o'], '--format');
  });

  for (const d of ['2024-2-01', '01-02-2024', '2024-02-30', '2023-02-29', '2024-13-01', 'yesterday']) {
    it(`rejects --since ${d}`, () => bad(['--since', d, 'o'], '--since'));
  }

  it('requires exactly one output file', () => {
    bad([], 'output');
    bad(['--verbose'], 'output');
    bad(['a.csv', 'b.csv'], 'output');
  });
});
