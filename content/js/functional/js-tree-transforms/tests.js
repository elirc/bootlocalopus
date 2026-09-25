const { filterTree, findPath, flatten, updateNode } = solution;

const makeTree = () => [
  { id: 'home', label: 'Home' },
  {
    id: 'settings',
    label: 'Settings',
    children: [
      { id: 'profile', label: 'Profile' },
      {
        id: 'billing',
        label: 'Billing',
        children: [
          { id: 'invoices', label: 'Invoices' },
          { id: 'cards', label: 'Payment cards' },
        ],
      },
      { id: 'team', label: 'Team', children: [] },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    children: [
      { id: 'docs', label: 'Docs' },
      { id: 'billing-faq', label: 'Billing FAQ' },
    ],
  },
];
const label = (q) => (node) => node.label.toLowerCase().includes(q);
const ids = (forest) => forest.map((n) => (n.children ? [n.id, ids(n.children)] : n.id));
const deepSnapshot = (x) => JSON.stringify(x);

describe('filterTree', () => {
  it('keeps matches together with their ancestors', () => {
    const tree = makeTree();
    const out = filterTree(tree, label('bill'));
    expect(ids(out)).toEqual([['settings', [['billing', []]]], ['help', ['billing-faq']]]);
  });

  it('keeps deep matches and drops everything else', () => {
    const out = filterTree(makeTree(), label('card'));
    expect(ids(out)).toEqual([['settings', [['billing', ['cards']]]]]);
    expect(filterTree(makeTree(), () => false)).toEqual([]);
  });

  it('a matching parent keeps only its matching children (possibly none)', () => {
    const out = filterTree(makeTree(), label('settings'));
    expect(ids(out)).toEqual([['settings', []]]);
    expect(out[0].label).toBe('Settings');
  });

  it('leaves without children stay without a children property', () => {
    const out = filterTree(makeTree(), label('home'));
    expect(out).toHaveLength(1);
    expect('children' in out[0]).toBe(false);
  });

  it('shares unchanged subtrees and copies the rest', () => {
    const tree = makeTree();
    const out = filterTree(tree, (n) => n.id === 'help' || n.id === 'billing-faq' || n.id === 'docs' || n.id === 'team');
    const help = out.find((n) => n.id === 'help');
    expect(help).toBe(tree[2]); // whole subtree kept
    const settings = out.find((n) => n.id === 'settings');
    expect(settings).not.toBe(tree[1]);
    expect(settings.children[0]).toBe(tree[1].children[2]); // the team node, with its empty children
  });

  it('returns the same array when nothing was removed, and never mutates', () => {
    const tree = makeTree();
    const before = deepSnapshot(tree);
    expect(filterTree(tree, () => true)).toBe(tree);
    filterTree(tree, label('bill'));
    expect(deepSnapshot(tree)).toBe(before);
  });
});

describe('findPath', () => {
  it('returns the root-to-match trail of original nodes', () => {
    const tree = makeTree();
    const trail = findPath(tree, (n) => n.id === 'invoices');
    expect(trail.map((n) => n.id)).toEqual(['settings', 'billing', 'invoices']);
    expect(trail[0]).toBe(tree[1]);
    expect(trail[2]).toBe(tree[1].children[1].children[0]);
  });

  it('finds the first match in pre-order', () => {
    expect(findPath(makeTree(), label('billing')).map((n) => n.id)).toEqual(['settings', 'billing']);
    expect(findPath(makeTree(), label('h')).map((n) => n.id)).toEqual(['home']);
  });

  it('returns [] when nothing matches', () => {
    expect(findPath(makeTree(), label('zzz'))).toEqual([]);
    expect(findPath([], () => true)).toEqual([]);
  });
});

describe('flatten', () => {
  it('lists every node in pre-order with depth and parentId', () => {
    const tree = makeTree();
    const rows = flatten(tree);
    expect(rows.map((r) => [r.node.id, r.depth, r.parentId])).toEqual([
      ['home', 0, null],
      ['settings', 0, null],
      ['profile', 1, 'settings'],
      ['billing', 1, 'settings'],
      ['invoices', 2, 'billing'],
      ['cards', 2, 'billing'],
      ['team', 1, 'settings'],
      ['help', 0, null],
      ['docs', 1, 'help'],
      ['billing-faq', 1, 'help'],
    ]);
    expect(rows[1].node).toBe(tree[1]);
  });

  it('skips the children of collapsed nodes', () => {
    const expanded = new Set(['settings']);
    const rows = flatten(makeTree(), { isExpanded: (n) => expanded.has(n.id) });
    expect(rows.map((r) => r.node.id)).toEqual(['home', 'settings', 'profile', 'billing', 'team', 'help']);
  });
});

describe('updateNode', () => {
  it('replaces one deep node and copies only its path', () => {
    const tree = makeTree();
    const before = deepSnapshot(tree);
    const out = updateNode(tree, 'cards', (n) => ({ ...n, label: 'Cards' }));
    expect(deepSnapshot(tree)).toBe(before);
    const billing = out[1].children[1];
    expect(billing.children[1]).toEqual({ id: 'cards', label: 'Cards' });
    expect(out).not.toBe(tree);
    expect(out[1]).not.toBe(tree[1]);
    expect(billing).not.toBe(tree[1].children[1]);
    expect(billing.children).not.toBe(tree[1].children[1].children);
    // Off the path: same objects.
    expect(out[0]).toBe(tree[0]);
    expect(out[2]).toBe(tree[2]);
    expect(out[1].children[0]).toBe(tree[1].children[0]);
    expect(out[1].children[2]).toBe(tree[1].children[2]);
    expect(billing.children[0]).toBe(tree[1].children[1].children[0]);
  });

  it('works on roots', () => {
    const tree = makeTree();
    const out = updateNode(tree, 'home', (n) => ({ ...n, label: 'Start' }));
    expect(out[0].label).toBe('Start');
    expect(out[1]).toBe(tree[1]);
  });

  it('returns the same array when the id is missing or fn changes nothing', () => {
    const tree = makeTree();
    let calls = 0;
    expect(updateNode(tree, 'nope', (n) => ({ ...n }))).toBe(tree);
    expect(updateNode(tree, 'invoices', (n) => { calls++; return n; })).toBe(tree);
    expect(calls).toBe(1);
  });

  it('only updates the first node with that id', () => {
    const forest = [
      { id: 'a', label: 'first', children: [{ id: 'dup', label: 'one' }] },
      { id: 'dup', label: 'two' },
    ];
    const out = updateNode(forest, 'dup', (n) => ({ ...n, label: n.label.toUpperCase() }));
    expect(out[0].children[0].label).toBe('ONE');
    expect(out[1]).toBe(forest[1]);
  });
});
