const { renderChangelog } = solution;

let n = 0;
/** A parsed commit with a fresh, unique sha. */
function aCommit(overrides = {}) {
  n += 1;
  const sha = (n.toString(16).padStart(7, '0') + 'abcdef0123456789abcdef0123456789abcdef').slice(0, 40);
  return { sha, type: 'fix', scope: null, description: `change ${n}`, breaking: false, breakingNote: null, pr: null, reverts: null, ...overrides };
}

const render = (commits) => renderChangelog('1.5.0', '2024-05-01', commits);

describe('renderChangelog: the example from the brief', () => {
  it('renders exactly', () => {
    const commits = [
      aCommit({ type: 'feat', scope: 'export', description: 'CSV export for orders', pr: 398 }),
      aCommit({ type: 'chore', scope: 'deps', description: 'bump eslint', pr: 399 }),
      aCommit({ type: 'feat', description: 'dark mode', pr: 401 }),
      aCommit({ sha: '3f2b8c1e9d4a4b7e8f215c6d7e8f9a0b1c2d3e4f', type: 'fix', scope: 'cart', description: 'keep discount after removing an item' }),
      aCommit({ type: 'feat', scope: 'api', description: 'return totals in cents', breaking: true, breakingNote: 'Totals are integers in cents, not decimal pounds.', pr: 412 }),
      aCommit({ type: 'docs', description: 'explain release process', pr: 413 }),
    ];
    expect(render(commits)).toBe([
      '## 1.5.0 (2024-05-01)',
      '',
      '### Breaking changes',
      '',
      '- **api:** Totals are integers in cents, not decimal pounds. (#412)',
      '',
      '### Features',
      '',
      '- **api:** return totals in cents (#412)',
      '- **export:** CSV export for orders (#398)',
      '- dark mode (#401)',
      '',
      '### Bug fixes',
      '',
      '- **cart:** keep discount after removing an item (3f2b8c1)',
      '',
    ].join('\n'));
  });
});

describe('renderChangelog: sections', () => {
  it('orders the sections breaking, features, fixes, performance, reverts, and skips empty ones', () => {
    const out = render([
      aCommit({ type: 'revert', description: 'revert "feat: beta banner"', reverts: 'f'.repeat(40), pr: 5 }),
      aCommit({ type: 'perf', description: 'faster search', pr: 4 }),
      aCommit({ type: 'fix', description: 'a fix', pr: 3 }),
      aCommit({ type: 'feat', description: 'a feature', pr: 2 }),
    ]);
    const headings = out.split('\n').filter((l) => l.startsWith('### '));
    expect(headings).toEqual(['### Features', '### Bug fixes', '### Performance', '### Reverts']);
    expect(out).toContain('### Reverts\n\n- revert "feat: beta banner" (#5)\n');
  });

  it('leaves out chores, docs, refactors, tests and ci unless they are breaking', () => {
    const out = render([
      aCommit({ type: 'chore', description: 'bump deps', pr: 1 }),
      aCommit({ type: 'refactor', description: 'split module', pr: 2 }),
      aCommit({ type: 'ci', description: 'cache', pr: 3 }),
      aCommit({ type: 'fix', description: 'real fix', pr: 4 }),
    ]);
    expect(out).toBe('## 1.5.0 (2024-05-01)\n\n### Bug fixes\n\n- real fix (#4)\n');
  });

  it('lists a breaking chore only under breaking changes, using its note', () => {
    const out = render([aCommit({ type: 'chore', breaking: true, breakingNote: 'Node 22 or later is required.', pr: 7 })]);
    expect(out).toBe('## 1.5.0 (2024-05-01)\n\n### Breaking changes\n\n- Node 22 or later is required. (#7)\n');
  });

  it('falls back to the description when a breaking commit has no note', () => {
    const out = render([aCommit({ type: 'fix', scope: 'auth', description: 'reject expired tokens', breaking: true, pr: 8 })]);
    expect(out).toBe([
      '## 1.5.0 (2024-05-01)', '',
      '### Breaking changes', '', '- **auth:** reject expired tokens (#8)', '',
      '### Bug fixes', '', '- **auth:** reject expired tokens (#8)', '',
    ].join('\n'));
  });

  it('says there are no user-facing changes when nothing qualifies', () => {
    expect(render([aCommit({ type: 'chore' }), aCommit({ type: 'docs' })])).toBe('## 1.5.0 (2024-05-01)\n\nNo user-facing changes.\n');
    expect(render([])).toBe('## 1.5.0 (2024-05-01)\n\nNo user-facing changes.\n');
  });
});

describe('renderChangelog: entries', () => {
  it('uses #pr, or the first 7 characters of the sha without one', () => {
    const out = render([
      aCommit({ sha: 'abcdef0123456789abcdef0123456789abcdef01', description: 'no pr' }),
      aCommit({ description: 'with pr', pr: 42 }),
    ]);
    expect(out).toContain('- no pr (abcdef0)\n');
    expect(out).toContain('- with pr (#42)\n');
  });

  it('puts scoped entries first, sorted by scope, and keeps commit order within a scope', () => {
    const out = render([
      aCommit({ type: 'feat', description: 'zebra', pr: 1 }),
      aCommit({ type: 'feat', scope: 'ui', description: 'second ui change', pr: 2 }),
      aCommit({ type: 'feat', scope: 'api', description: 'b api change', pr: 3 }),
      aCommit({ type: 'feat', description: 'apple', pr: 4 }),
      aCommit({ type: 'feat', scope: 'api', description: 'a api change', pr: 5 }),
      aCommit({ type: 'feat', scope: 'ui', description: 'first ui change', pr: 6 }),
    ]);
    expect(out.split('\n').filter((l) => l.startsWith('- '))).toEqual([
      '- **api:** b api change (#3)',
      '- **api:** a api change (#5)',
      '- **ui:** second ui change (#2)',
      '- **ui:** first ui change (#6)',
      '- zebra (#1)',
      '- apple (#4)',
    ]);
  });
});

describe('renderChangelog: reverts', () => {
  it('drops a commit and its revert when both are in this release, even a breaking one', () => {
    const risky = aCommit({ type: 'feat', scope: 'api', description: 'new pagination', breaking: true, breakingNote: 'page is 0-based', pr: 20 });
    const keep = aCommit({ type: 'feat', description: 'kept', pr: 21 });
    const undo = aCommit({ type: 'revert', description: 'revert "feat(api)!: new pagination"', reverts: risky.sha, pr: 22 });
    expect(render([risky, keep, undo])).toBe('## 1.5.0 (2024-05-01)\n\n### Features\n\n- kept (#21)\n');
  });

  it('lists a revert of something from an earlier release', () => {
    const undo = aCommit({ type: 'revert', scope: 'search', description: 'revert fuzzy matching', reverts: 'e'.repeat(40), pr: 30 });
    expect(render([undo])).toBe('## 1.5.0 (2024-05-01)\n\n### Reverts\n\n- **search:** revert fuzzy matching (#30)\n');
  });

  it('gives no user-facing changes when a release only adds and reverts one feature', () => {
    const f = aCommit({ type: 'feat', description: 'beta banner', pr: 40 });
    expect(render([f, aCommit({ type: 'revert', description: 'revert beta banner', reverts: f.sha, pr: 41 })])).toBe('## 1.5.0 (2024-05-01)\n\nNo user-facing changes.\n');
  });
});
