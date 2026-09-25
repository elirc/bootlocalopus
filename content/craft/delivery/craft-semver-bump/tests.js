const { nextVersion } = solution;

describe('nextVersion: which bump', () => {
  it('bumps patch for fixes and performance work', () => {
    expect(nextVersion('1.4.2', ['fix: handle empty cart'])).toBe('1.4.3');
    expect(nextVersion('1.4.2', ['perf(db): add index on orders.customer_id'])).toBe('1.4.3');
  });

  it('bumps minor for a feature, and resets the patch', () => {
    expect(nextVersion('1.4.2', ['feat: export orders as CSV'])).toBe('1.5.0');
  });

  it('bumps major for a ! before the colon, whatever the type, and resets the rest', () => {
    expect(nextVersion('1.4.2', ['feat!: drop the v1 endpoints'])).toBe('2.0.0');
    expect(nextVersion('1.4.2', ['refactor(api)!: rename total to totalCents'])).toBe('2.0.0');
    expect(nextVersion('1.4.2', ['chore!: require Node 22'])).toBe('2.0.0');
  });

  it('bumps major for a BREAKING CHANGE footer in the body', () => {
    expect(nextVersion('3.1.0', ['fix: validate emails\n\nStricter parsing.\n\nBREAKING CHANGE: addresses without a TLD are rejected'])).toBe('4.0.0');
    expect(nextVersion('3.1.0', ['feat(auth): rotate tokens\n\nBREAKING-CHANGE: sessions older than 30 days are logged out'])).toBe('4.0.0');
  });

  it('returns null when nothing warrants a release', () => {
    expect(nextVersion('1.4.2', ['docs: fix typo', 'chore(deps): bump eslint', 'test: cover refunds', 'ci: cache node_modules'])).toBeNull();
    expect(nextVersion('1.4.2', [])).toBeNull();
  });
});

describe('nextVersion: combining commits', () => {
  it('applies the largest bump once', () => {
    expect(nextVersion('1.4.2', ['fix: a', 'feat: b', 'fix: c', 'feat: d', 'docs: e'])).toBe('1.5.0');
    expect(nextVersion('1.4.2', ['feat: a', 'fix!: b', 'feat: c'])).toBe('2.0.0');
    expect(nextVersion('1.4.2', ['fix: a', 'fix: b', 'fix: c'])).toBe('1.4.3');
  });

  it('does not depend on the order of the commits', () => {
    expect(nextVersion('1.4.2', ['feat: a', 'fix: b'])).toBe(nextVersion('1.4.2', ['fix: b', 'feat: a']));
    expect(nextVersion('1.4.2', ['refactor!: x', 'docs: y'])).toBe('2.0.0');
    expect(nextVersion('1.4.2', ['docs: y', 'refactor!: x'])).toBe('2.0.0');
  });
});

describe('nextVersion: reading headers', () => {
  it('ignores messages that are not conventional commits', () => {
    expect(nextVersion('1.4.2', ["Merge branch 'main' into feature/x", 'wip', 'feature: new thing', 'feat:no space', 'fixed the bug'])).toBeNull();
  });

  it('compares the type case-insensitively', () => {
    expect(nextVersion('1.4.2', ['Fix: capitalised by a GUI client'])).toBe('1.4.3');
    expect(nextVersion('1.4.2', ['FEAT(ui): shouting'])).toBe('1.5.0');
  });

  it('only reads the header from the first line', () => {
    expect(nextVersion('1.4.2', ['chore: tidy\n\nfeat: this line is in the body'])).toBeNull();
  });

  it('does not treat "breaking change" in the header, or mid-line in the body, as breaking', () => {
    expect(nextVersion('1.4.2', ['docs: explain our BREAKING CHANGE: policy'])).toBeNull();
    expect(nextVersion('1.4.2', ['fix: tidy\n\nThis is not a BREAKING CHANGE: honest'])).toBe('1.4.3');
    expect(nextVersion('1.4.2', ['fix: tidy\n\nbreaking change: lower case does not count'])).toBe('1.4.3');
  });

  it('ignores a BREAKING CHANGE footer on a commit that is not conventional', () => {
    expect(nextVersion('1.4.2', ['Update stuff\n\nBREAKING CHANGE: nobody used the right format'])).toBeNull();
  });
});

describe('nextVersion: before 1.0', () => {
  it('bumps minor, not major, for a breaking change while major is 0', () => {
    expect(nextVersion('0.4.2', ['feat!: new config format'])).toBe('0.5.0');
    expect(nextVersion('0.4.2', ['fix: x\n\nBREAKING CHANGE: y'])).toBe('0.5.0');
  });

  it('still bumps minor for features and patch for fixes', () => {
    expect(nextVersion('0.4.2', ['feat: x'])).toBe('0.5.0');
    expect(nextVersion('0.4.2', ['fix: x'])).toBe('0.4.3');
    expect(nextVersion('0.0.0', ['fix: first'])).toBe('0.0.1');
  });
});

describe('nextVersion: the current version', () => {
  it('handles multi-digit parts numerically', () => {
    expect(nextVersion('9.19.9', ['fix: x'])).toBe('9.19.10');
    expect(nextVersion('9.19.9', ['feat: x'])).toBe('9.20.0');
    expect(nextVersion('9.19.9', ['feat!: x'])).toBe('10.0.0');
  });

  it('throws a TypeError for anything that is not MAJOR.MINOR.PATCH', () => {
    for (const bad of ['1.2', 'v1.2.3', '1.2.3-beta.1', '01.2.3', '1.2.x', '', '1.2.3.4']) {
      expect(() => nextVersion(bad, ['fix: x'])).toThrow(TypeError);
    }
  });
});
