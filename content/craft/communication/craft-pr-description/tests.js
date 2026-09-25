const { reviewPrDescription } = solution;

const TEMPLATE = [
  '## What',
  '<!-- What does this change do? -->',
  '',
  '## Why',
  '<!-- Link the ticket, e.g. SHOP-123, and say why it matters. -->',
  '',
  '## How to test',
  '<!-- Steps a reviewer can follow. -->',
  '',
  '## Checklist',
  '- [ ] I added or updated tests',
  '- [ ] I checked this on a phone',
].join('\n');

/** A good description; override sections by passing replacement text. */
function aBody({
  what = 'Adds CSV export to the orders page.',
  why = 'Finance reconciles orders by hand every month (SHOP-412).',
  howToTest = '1. Open /orders\n2. Click Export\n3. Open the file in a spreadsheet',
  extra = '',
} = {}) {
  return `## What\n${what}\n\n## Why\n${why}\n\n## How to test\n${howToTest}\n${extra}`;
}

const rules = (problems) => problems.map((p) => (p.detail === null ? p.rule : `${p.rule}: ${p.detail}`));

describe('reviewPrDescription: a good description', () => {
  it('has no problems', () => {
    expect(reviewPrDescription(aBody())).toEqual([]);
  });

  it('accepts checked boxes and ### headings in any case', () => {
    const body = '### WHAT\nx\n### why\nSHOP-1\n### How To Test\nrun it\n## Checklist\n- [x] tests';
    expect(reviewPrDescription(body)).toEqual([]);
  });
});

describe('reviewPrDescription: the untouched template', () => {
  it('reports every empty section, the missing ticket and every unchecked box, in order', () => {
    expect(reviewPrDescription(TEMPLATE)).toEqual([
      { rule: 'empty-section', detail: 'What' },
      { rule: 'empty-section', detail: 'Why' },
      { rule: 'empty-section', detail: 'How to test' },
      { rule: 'no-ticket', detail: null },
      { rule: 'unchecked-box', detail: 'I added or updated tests' },
      { rule: 'unchecked-box', detail: 'I checked this on a phone' },
    ]);
  });
});

describe('reviewPrDescription: sections', () => {
  it('tells a missing section from an empty one', () => {
    const body = '## What\nAdds export (SHOP-1).\n\n## How to test\nTODO';
    expect(rules(reviewPrDescription(body))).toEqual(['missing-section: Why', 'empty-section: How to test']);
  });

  it('treats TODO, TBD and N/A in any case as empty', () => {
    for (const filler of ['TODO', 'tbd', 'n/a', '  N/A  ']) {
      expect(rules(reviewPrDescription(aBody({ howToTest: filler })))).toEqual(['empty-section: How to test']);
    }
  });

  it('counts real text that mentions TODO as content', () => {
    expect(reviewPrDescription(aBody({ howToTest: 'TODO: none, this only renames a variable' }))).toEqual([]);
  });

  it('ends a section at any heading, including a level-1 or level-4 one', () => {
    const body = '## What\n# Big heading\nnot part of What\n## Why\nSHOP-9\n## How to test\nrun\n#### Notes\nx';
    expect(rules(reviewPrDescription(body))).toEqual(['empty-section: What']);
  });

  it('ignores a comment that spans several lines', () => {
    const body = aBody({ what: '<!--\n  Describe the change.\n  Be specific.\n-->' });
    expect(rules(reviewPrDescription(body))).toEqual(['empty-section: What']);
  });
});

describe('reviewPrDescription: tickets', () => {
  it('does not count a ticket key that is only inside a template comment', () => {
    const body = aBody({ why: '<!-- e.g. SHOP-123 -->\nFinance asked for it.' });
    expect(rules(reviewPrDescription(body))).toEqual(['no-ticket']);
  });

  it('accepts a ticket key anywhere in the body', () => {
    expect(reviewPrDescription(aBody({ why: 'Finance asked.', extra: '\nCloses PAY2-77' }))).toEqual([]);
  });

  it('does not treat lower-case or numberless keys as tickets', () => {
    expect(rules(reviewPrDescription(aBody({ why: 'see shop-12 and SHOP-' })))).toEqual(['no-ticket']);
  });

  it('allows no ticket with the no-ticket label', () => {
    expect(reviewPrDescription(aBody({ why: 'Typo fix.' }), { labels: ['docs', 'no-ticket'] })).toEqual([]);
  });
});

describe('reviewPrDescription: screenshots', () => {
  it('asks for a screenshot when UI files change', () => {
    for (const file of ['src/Orders.tsx', 'src/old/Cart.jsx', 'src/theme.css', 'src/theme.scss']) {
      expect(rules(reviewPrDescription(aBody(), { changedFiles: ['README.md', file] }))).toEqual(['no-screenshot']);
    }
  });

  it('accepts a markdown image or an img tag', () => {
    const files = { changedFiles: ['src/Orders.tsx'] };
    expect(reviewPrDescription(aBody({ extra: '\n![export button](https://example.com/a.png)' }), files)).toEqual([]);
    expect(reviewPrDescription(aBody({ extra: '\n<img width="400" src="https://example.com/a.png">' }), files)).toEqual([]);
  });

  it('does not count an image inside a comment, and does not ask when no UI file changed', () => {
    expect(rules(reviewPrDescription(aBody({ extra: '\n<!-- ![before](x.png) -->' }), { changedFiles: ['src/a.tsx'] }))).toEqual(['no-screenshot']);
    expect(reviewPrDescription(aBody(), { changedFiles: ['src/api.ts', 'src/Orders.test.ts'] })).toEqual([]);
  });
});

describe('reviewPrDescription: migrations', () => {
  it('needs a non-empty Rollback section when a migrations directory changes', () => {
    const files = { changedFiles: ['db/migrations/0042_add_currency.sql'] };
    expect(rules(reviewPrDescription(aBody(), files))).toEqual(['no-rollback']);
    expect(rules(reviewPrDescription(aBody({ extra: '\n## Rollback\nN/A' }), files))).toEqual(['no-rollback']);
    expect(reviewPrDescription(aBody({ extra: '\n## Rollback\nThe column is nullable; old code ignores it. Drop it in a later PR if needed.' }), files)).toEqual([]);
  });

  it('only counts a directory called migrations', () => {
    expect(reviewPrDescription(aBody(), { changedFiles: ['src/migrationsHelper.ts', 'migrations.md', 'src/data-migrations/x.sql'] })).toEqual([]);
    expect(rules(reviewPrDescription(aBody(), { changedFiles: ['migrations/0001.sql'] }))).toEqual(['no-rollback']);
  });
});

describe('reviewPrDescription: order', () => {
  it('reports sections, ticket, screenshot, rollback, then boxes in body order', () => {
    const body = '## What\nx\n- [ ] first\n## How to test\n  - [ ] indented second\n- [x] done\n## Notes\n- [ ] third ';
    const problems = reviewPrDescription(body, { changedFiles: ['web/App.tsx', 'api/migrations/7.sql'] });
    expect(rules(problems)).toEqual([
      'missing-section: Why',
      'no-ticket',
      'no-screenshot',
      'no-rollback',
      'unchecked-box: first',
      'unchecked-box: indented second',
      'unchecked-box: third',
    ]);
  });
});
