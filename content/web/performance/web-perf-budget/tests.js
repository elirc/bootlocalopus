const { checkBudget } = solution;

const MANIFEST = {
  'src/main.ts': {
    file: 'assets/main.js', isEntry: true, src: 'src/main.ts',
    imports: ['_ui.js', '_utils.js'], dynamicImports: ['src/pages/Admin.tsx'], css: ['assets/main.css'],
  },
  '_ui.js': { file: 'assets/ui.js', imports: ['_vendor.js'], css: ['assets/ui.css', 'assets/shared.css'] },
  '_utils.js': { file: 'assets/utils.js', imports: ['_vendor.js'] },
  '_vendor.js': { file: 'assets/vendor.js', css: ['assets/shared.css'] },
  'src/pages/Admin.tsx': {
    file: 'assets/Admin.js', isDynamicEntry: true, src: 'src/pages/Admin.tsx',
    imports: ['_vendor.js', '_charts.js'], css: ['assets/admin.css'],
  },
  '_charts.js': { file: 'assets/charts.js' },
  'src/embed.ts': { file: 'assets/embed.js', isEntry: true, src: 'src/embed.ts', imports: ['_a.js'] },
  '_a.js': { file: 'assets/a.js', imports: ['_b.js'] },
  '_b.js': { file: 'assets/b.js', imports: ['_a.js', '_utils.js'] },
};

const SIZES = {
  'assets/main.js': 20_000,
  'assets/ui.js': 30_000,
  'assets/utils.js': 5_000,
  'assets/vendor.js': 60_000,
  'assets/Admin.js': 15_000,
  'assets/charts.js': 180_000,
  'assets/embed.js': 3_000,
  'assets/a.js': 1_000,
  'assets/b.js': 2_000,
  'assets/main.css': 8_000,
  'assets/ui.css': 4_000,
  'assets/shared.css': 2_000,
  'assets/admin.css': 9_000,
};

describe('initial cost per entry', () => {
  it('sums static imports once each, ignoring dynamic imports', () => {
    const { entries } = checkBudget(MANIFEST, SIZES, {});
    expect(entries[0]).toEqual({
      name: 'src/main.ts',
      js: 20_000 + 30_000 + 5_000 + 60_000,
      css: 8_000 + 4_000 + 2_000,
      files: ['assets/main.js', 'assets/ui.js', 'assets/utils.js', 'assets/vendor.js'],
    });
  });

  it('survives import cycles', () => {
    const { entries } = checkBudget(MANIFEST, SIZES, {});
    expect(entries[1]).toEqual({
      name: 'src/embed.ts',
      js: 3_000 + 1_000 + 2_000 + 5_000 + 60_000,
      css: 2_000,
      files: ['assets/a.js', 'assets/b.js', 'assets/embed.js', 'assets/utils.js', 'assets/vendor.js'],
    });
  });

  it('lists only isEntry chunks, in manifest order', () => {
    const { entries } = checkBudget(MANIFEST, SIZES, {});
    expect(entries.map((e) => e.name)).toEqual(['src/main.ts', 'src/embed.ts']);
  });

  it('counts a file shared by two keys once', () => {
    const manifest = {
      'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_x.js', '_y.js'] },
      '_x.js': { file: 'assets/shared.js' },
      '_y.js': { file: 'assets/shared.js' },
    };
    const { entries } = checkBudget(manifest, { 'assets/index.js': 1, 'assets/shared.js': 10 }, {});
    expect(entries).toEqual([{ name: 'index.html', js: 11, css: 0, files: ['assets/index.js', 'assets/shared.js'] }]);
  });
});

describe('violations', () => {
  it('reports entries over budget, then oversized chunks sorted by file', () => {
    const report = checkBudget(MANIFEST, SIZES, { initialJs: 100_000, initialCss: 10_000, chunk: 50_000 });
    expect(report.violations).toEqual([
      { kind: 'initial-js', entry: 'src/main.ts', size: 115_000, budget: 100_000 },
      { kind: 'initial-css', entry: 'src/main.ts', size: 14_000, budget: 10_000 },
      { kind: 'chunk', file: 'assets/charts.js', size: 180_000, budget: 50_000 },
      { kind: 'chunk', file: 'assets/vendor.js', size: 60_000, budget: 50_000 },
    ]);
    expect(report.ok).toBe(false);
  });

  it('allows exactly the budget, and skips absent budgets', () => {
    const report = checkBudget(MANIFEST, SIZES, { initialJs: 115_000, initialCss: 14_000, chunk: 180_000 });
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(checkBudget(MANIFEST, SIZES, {}).ok).toBe(true);
  });

  it('checks only the budgets it is given', () => {
    const report = checkBudget(MANIFEST, SIZES, { initialCss: 1 });
    expect(report.violations).toEqual([
      { kind: 'initial-css', entry: 'src/main.ts', size: 14_000, budget: 1 },
      { kind: 'initial-css', entry: 'src/embed.ts', size: 2_000, budget: 1 },
    ]);
    const js = checkBudget(MANIFEST, SIZES, { initialJs: 80_000 });
    expect(js.violations).toEqual([{ kind: 'initial-js', entry: 'src/main.ts', size: 115_000, budget: 80_000 }]);
  });
});

describe('missing data', () => {
  it('throws naming a file without a size', () => {
    const sizes = { ...SIZES };
    delete sizes['assets/vendor.js'];
    expect(() => checkBudget(MANIFEST, sizes, {})).toThrow('assets/vendor.js');
    const noCss = { ...SIZES };
    delete noCss['assets/shared.css'];
    expect(() => checkBudget(MANIFEST, noCss, {})).toThrow('assets/shared.css');
  });

  it('accepts a size of zero', () => {
    const report = checkBudget({ 'e.ts': { file: 'e.js', isEntry: true } }, { 'e.js': 0 }, { initialJs: 0 });
    expect(report).toEqual({ entries: [{ name: 'e.ts', js: 0, css: 0, files: ['e.js'] }], violations: [], ok: true });
  });
});
