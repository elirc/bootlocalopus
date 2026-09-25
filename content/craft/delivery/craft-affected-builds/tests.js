const { affectedPackages } = solution;

const pkg = (name, dir, deps = []) => ({ name, dir, deps });

// money <- checkout <- web ; money <- invoices <- admin ; utils is used by nobody
const SHOP = () => [
  pkg('money', 'packages/money'),
  pkg('checkout', 'packages/checkout', ['money', 'react']),
  pkg('invoices', 'packages/invoices', ['money']),
  pkg('web', 'apps/web', ['checkout', 'lodash']),
  pkg('admin', 'apps/admin', ['invoices']),
  pkg('utils', 'packages/utils'),
];
const GLOBALS = { globalFiles: ['package-lock.json', 'tsconfig.base.json', '.github/workflows/'] };

describe('affectedPackages: dependents', () => {
  it('includes everything that depends on a changed package, transitively', () => {
    expect(affectedPackages(['packages/money/src/round.ts'], SHOP())).toEqual(['admin', 'checkout', 'invoices', 'money', 'web']);
  });

  it('does not include what the changed package depends on', () => {
    expect(affectedPackages(['packages/checkout/src/cart.ts'], SHOP())).toEqual(['checkout', 'web']);
    expect(affectedPackages(['apps/web/src/page.tsx'], SHOP())).toEqual(['web']);
  });

  it('combines several changed packages without duplicates', () => {
    expect(affectedPackages(['packages/checkout/a.ts', 'packages/checkout/b.ts', 'packages/invoices/c.ts'], SHOP())).toEqual(['admin', 'checkout', 'invoices', 'web']);
  });

  it('ignores external dependencies', () => {
    const packages = [pkg('ui', 'packages/ui', ['react', 'react-dom']), pkg('app', 'apps/app', ['ui', 'react'])];
    expect(affectedPackages(['packages/ui/Button.tsx'], packages)).toEqual(['app', 'ui']);
  });

  it('terminates on a dependency cycle and includes everything on it', () => {
    const packages = [pkg('a', 'packages/a', ['c']), pkg('b', 'packages/b', ['a']), pkg('c', 'packages/c', ['b']), pkg('d', 'packages/d', ['c']), pkg('e', 'packages/e')];
    expect(affectedPackages(['packages/a/index.js'], packages)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not depend on the order of the package list', () => {
    const reversed = SHOP().reverse();
    expect(affectedPackages(['packages/money/src/round.ts'], reversed)).toEqual(['admin', 'checkout', 'invoices', 'money', 'web']);
  });
});

describe('affectedPackages: owning a file', () => {
  it('compares whole path segments, not string prefixes', () => {
    const packages = [pkg('api', 'packages/api'), pkg('api-client', 'packages/api-client')];
    expect(affectedPackages(['packages/api-client/src/index.ts'], packages)).toEqual(['api-client']);
    expect(affectedPackages(['packages/apix.ts'], packages)).toEqual([]);
  });

  it('gives a file in nested package dirs to the deepest one', () => {
    const packages = [pkg('web', 'apps/web'), pkg('pay-plugin', 'apps/web/plugins/pay')];
    expect(affectedPackages(['apps/web/plugins/pay/index.ts'], packages)).toEqual(['pay-plugin']);
    expect(affectedPackages(['apps/web/plugins/other.ts'], packages)).toEqual(['web']);
  });

  it('ignores files outside every package that are not global', () => {
    expect(affectedPackages(['docs/adr/0007.txt', 'scripts/release.sh', 'packages/readme.txt'], SHOP(), GLOBALS)).toEqual([]);
  });

  it('returns an empty list for no changes', () => {
    expect(affectedPackages([], SHOP(), GLOBALS)).toEqual([]);
  });
});

describe('affectedPackages: markdown and global files', () => {
  it('ignores markdown files, inside packages and out', () => {
    expect(affectedPackages(['packages/money/README.md', 'CHANGELOG.md', 'docs/guide.md'], SHOP(), GLOBALS)).toEqual([]);
  });

  it('affects everything when an exact global file changes', () => {
    expect(affectedPackages(['package-lock.json'], SHOP(), GLOBALS)).toEqual(['admin', 'checkout', 'invoices', 'money', 'utils', 'web']);
  });

  it('treats a global entry ending in / as a directory prefix', () => {
    expect(affectedPackages(['.github/workflows/ci.yml'], SHOP(), GLOBALS)).toHaveLength(6);
    expect(affectedPackages(['.github/CODEOWNERS'], SHOP(), GLOBALS)).toEqual([]);
  });

  it('matches exact global paths exactly', () => {
    expect(affectedPackages(['packages/money/package-lock.json'], SHOP(), GLOBALS)).toEqual(['admin', 'checkout', 'invoices', 'money', 'web']);
    expect(affectedPackages(['tsconfig.base.json.bak'], SHOP(), GLOBALS)).toEqual([]);
  });

  it('has no global files by default', () => {
    expect(affectedPackages(['package-lock.json'], SHOP())).toEqual([]);
  });
});
