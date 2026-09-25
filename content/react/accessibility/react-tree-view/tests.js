const { TreeView } = solution;

const nodes = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'Button.jsx' },
          { id: 'tree', label: 'Tree.jsx' },
        ],
      },
      { id: 'index', label: 'index.js' },
    ],
  },
  { id: 'pkg', label: 'package.json' },
  { id: 'readme', label: 'README.md', children: [] },
];

const item = (name) => screen.getByRole('treeitem', { name });
const visibleNames = () => screen.getAllByRole('treeitem').map((el) => el.getAttribute('aria-label'));
const focusedName = () => document.activeElement.getAttribute('aria-label');
const tabStops = () => screen.getAllByRole('treeitem').filter((el) => el.tabIndex === 0).map((el) => el.getAttribute('aria-label'));
const press = (key) => fireEvent.keyDown(document.activeElement, { key });

function setup() {
  const selected = [];
  const utils = render(<TreeView label="Files" nodes={nodes} onSelect={(id) => selected.push(id)} />);
  return { ...utils, selected };
}

function focusFirst() {
  item('src').focus();
}

describe('TreeView markup', () => {
  it('renders a labelled tree of top-level items, all collapsed', () => {
    setup();
    expect(screen.getByRole('tree', { name: 'Files' })).toBeTruthy();
    expect(visibleNames()).toEqual(['src', 'package.json', 'README.md']);
    expect(item('src').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('marks only parents with aria-expanded, and treats an empty children array as a leaf', () => {
    setup();
    expect(item('package.json').hasAttribute('aria-expanded')).toBe(false);
    expect(item('README.md').hasAttribute('aria-expanded')).toBe(false);
  });

  it('gives each item its level, set size and position', () => {
    setup();
    fireEvent.click(item('src'));
    fireEvent.click(item('components'));
    const tree = item('Tree.jsx');
    expect(tree.getAttribute('aria-level')).toBe('3');
    expect(tree.getAttribute('aria-setsize')).toBe('2');
    expect(tree.getAttribute('aria-posinset')).toBe('2');
    expect(item('index.js').getAttribute('aria-level')).toBe('2');
    expect(item('index.js').getAttribute('aria-posinset')).toBe('2');
    expect(item('README.md').getAttribute('aria-level')).toBe('1');
    expect(item('README.md').getAttribute('aria-setsize')).toBe('3');
    expect(item('README.md').getAttribute('aria-posinset')).toBe('3');
  });

  it('nests children in a group inside the expanded parent', () => {
    setup();
    fireEvent.click(item('src'));
    const group = within(item('src')).getByRole('group');
    expect(within(group).getAllByRole('treeitem').map((el) => el.getAttribute('aria-label')))
      .toEqual(['components', 'index.js']);
  });

  it('starts unselected, with the first item as the only tab stop', () => {
    setup();
    expect(tabStops()).toEqual(['src']);
    expect(screen.getAllByRole('treeitem').every((el) => el.getAttribute('aria-selected') === 'false')).toBe(true);
  });
});

describe('TreeView keyboard', () => {
  it('moves down and up through visible items without wrapping', () => {
    setup();
    focusFirst();
    expect(press('ArrowDown')).toBe(false);
    expect(focusedName()).toBe('package.json');
    press('ArrowDown');
    press('ArrowDown');
    expect(focusedName()).toBe('README.md');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(focusedName()).toBe('src');
    expect(tabStops()).toEqual(['src']);
  });

  it('expands with ArrowRight, then moves into the first child', () => {
    setup();
    focusFirst();
    press('ArrowRight');
    expect(item('src').getAttribute('aria-expanded')).toBe('true');
    expect(focusedName()).toBe('src');
    press('ArrowRight');
    expect(focusedName()).toBe('components');
    press('ArrowRight');
    press('ArrowRight');
    expect(focusedName()).toBe('Button.jsx');
    press('ArrowRight');
    expect(focusedName()).toBe('Button.jsx');
  });

  it('includes expanded children when moving down', () => {
    setup();
    focusFirst();
    press('ArrowRight');
    press('ArrowDown');
    press('ArrowDown');
    expect(focusedName()).toBe('index.js');
    press('ArrowDown');
    expect(focusedName()).toBe('package.json');
  });

  it('collapses with ArrowLeft, or moves to the parent', () => {
    setup();
    focusFirst();
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    expect(focusedName()).toBe('Button.jsx');
    press('ArrowLeft');
    expect(focusedName()).toBe('components');
    press('ArrowLeft');
    expect(item('components').getAttribute('aria-expanded')).toBe('false');
    expect(focusedName()).toBe('components');
    press('ArrowLeft');
    expect(focusedName()).toBe('src');
    press('ArrowLeft');
    expect(item('src').getAttribute('aria-expanded')).toBe('false');
    press('ArrowLeft');
    expect(focusedName()).toBe('src');
  });

  it('jumps to the first and last visible items', () => {
    setup();
    focusFirst();
    press('ArrowRight');
    press('End');
    expect(focusedName()).toBe('README.md');
    press('Home');
    expect(focusedName()).toBe('src');
  });

  it('moves the tab stop with focus', () => {
    setup();
    focusFirst();
    press('ArrowDown');
    expect(tabStops()).toEqual(['package.json']);
  });

  it('finds items by their first letter, after the current one and wrapping', () => {
    setup();
    focusFirst();
    press('ArrowRight');
    press('i');
    expect(focusedName()).toBe('index.js');
    press('C');
    expect(focusedName()).toBe('components');
    press('p');
    expect(focusedName()).toBe('package.json');
    press('s');
    expect(focusedName()).toBe('src');
    press('z');
    expect(focusedName()).toBe('src');
  });

  it('ignores keys it does not handle', () => {
    setup();
    focusFirst();
    expect(press('Tab')).toBe(true);
    expect(focusedName()).toBe('src');
  });
});

describe('TreeView selecting', () => {
  it('selects the focused item with Enter or Space', () => {
    const { selected } = setup();
    focusFirst();
    press('ArrowDown');
    expect(press('Enter')).toBe(false);
    expect(item('package.json').getAttribute('aria-selected')).toBe('true');
    press('ArrowDown');
    expect(press(' ')).toBe(false);
    expect(item('README.md').getAttribute('aria-selected')).toBe('true');
    expect(item('package.json').getAttribute('aria-selected')).toBe('false');
    expect(selected).toEqual(['pkg', 'readme']);
  });

  it('clicking a parent focuses, selects and toggles it', () => {
    const { selected } = setup();
    fireEvent.click(item('src'));
    expect(item('src').getAttribute('aria-expanded')).toBe('true');
    expect(item('src').getAttribute('aria-selected')).toBe('true');
    expect(focusedName()).toBe('src');
    fireEvent.click(item('src'));
    expect(item('src').getAttribute('aria-expanded')).toBe('false');
    expect(selected).toEqual(['src', 'src']);
  });

  it('a click on a child does not also click its ancestors', () => {
    const { selected } = setup();
    fireEvent.click(item('src'));
    fireEvent.click(item('components'));
    fireEvent.click(item('Tree.jsx'));
    expect(selected).toEqual(['src', 'components', 'tree']);
    expect(item('src').getAttribute('aria-expanded')).toBe('true');
    expect(item('components').getAttribute('aria-expanded')).toBe('true');
    expect(item('Tree.jsx').getAttribute('aria-selected')).toBe('true');
    expect(item('src').getAttribute('aria-selected')).toBe('false');
    expect(focusedName()).toBe('Tree.jsx');
    expect(tabStops()).toEqual(['Tree.jsx']);
  });

  it('continues with the keyboard from a clicked item', () => {
    setup();
    fireEvent.click(item('src'));
    fireEvent.click(item('index.js'));
    press('ArrowUp');
    expect(focusedName()).toBe('components');
  });
});

describe('TreeView when nodes change', () => {
  it('falls back to the first item when the tab stop disappears', () => {
    const { rerender } = setup();
    focusFirst();
    press('End');
    expect(tabStops()).toEqual(['README.md']);
    rerender(<TreeView label="Files" nodes={nodes.slice(0, 2)} onSelect={() => {}} />);
    expect(tabStops()).toEqual(['src']);
  });
});
