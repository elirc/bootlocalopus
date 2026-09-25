const makeItems = (n) => Array.from({ length: n }, (_, i) => ({ id: 'row-' + i, name: 'Item ' + i }));

function renderList(props = {}) {
  const calls = [];
  const renderItem = (item, index) => {
    calls.push(index);
    return <span>{item.name}</span>;
  };
  const all = { items: makeItems(10000), itemHeight: 20, height: 100, renderItem, label: 'Results', ...props };
  const utils = render(<solution.VirtualList {...all} />);
  return { ...utils, calls, props: all };
}

const list = () => screen.getByRole('list', { name: 'Results' });
const rows = () => screen.queryAllByRole('listitem');
const positions = () => rows().map((r) => Number(r.getAttribute('aria-posinset')));
const range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i + 1); // 1-based posinset values
const scrollTo = (top) => fireEvent.scroll(list(), { target: { scrollTop: top } });

describe('VirtualList: what it renders', () => {
  it('renders only the visible rows plus overscan at the top', () => {
    renderList();
    // 100px / 20px = 5 visible (indexes 0-4), plus 3 overscan below.
    expect(positions()).toEqual(range(0, 8));
  });

  it('calls renderItem only for the rows it renders', () => {
    const { calls } = renderList();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(Math.max(...calls)).toBeLessThan(8);
  });

  it('labels each row with its absolute position and the full set size', () => {
    renderList();
    const first = rows()[0];
    expect(first.getAttribute('aria-setsize')).toBe('10000');
    expect(first.textContent).toBe('Item 0');
  });

  it('gives the scroll content the height of the whole list', () => {
    renderList();
    const spacer = list().firstElementChild;
    expect(spacer).toBeTruthy();
    expect(spacer.style.height).toBe('200000px');
    expect(list().style.height).toBe('100px');
  });

  it('positions each row absolutely at index * itemHeight', () => {
    renderList();
    scrollTo(1000);
    const row = rows().find((r) => r.getAttribute('aria-posinset') === '51');
    expect(row).toBeTruthy();
    expect(row.style.position).toBe('absolute');
    expect(row.style.top).toBe('1000px');
    expect(row.style.height).toBe('20px');
    expect(row.textContent).toBe('Item 50');
  });

  it('respects a custom overscan, including 0', () => {
    renderList({ overscan: 0 });
    expect(positions()).toEqual(range(0, 5));
    scrollTo(1000);
    expect(positions()).toEqual(range(50, 55));
  });
});

describe('VirtualList: scrolling', () => {
  it('moves the window when the list scrolls', () => {
    renderList();
    scrollTo(1000);
    // First visible index 50, last visible 54; overscan 3 either side.
    expect(positions()).toEqual(range(47, 58));
  });

  it('includes a partly visible row at the bottom', () => {
    renderList({ overscan: 0 });
    scrollTo(1010);
    // Rows 50 (half hidden) through 55 (half visible) are all on screen.
    expect(positions()).toEqual(range(50, 56));
  });

  it('clamps the window at the end of the list', () => {
    renderList({ items: makeItems(100) });
    scrollTo(1900); // the maximum: 100 * 20 - 100
    expect(positions()).toEqual(range(92, 100));
  });

  it('keeps the DOM node of a row that stays on screen', () => {
    renderList();
    scrollTo(1000);
    const before = rows().find((r) => r.getAttribute('aria-posinset') === '53');
    scrollTo(1040);
    const after = rows().find((r) => r.getAttribute('aria-posinset') === '53');
    expect(after).toBeTruthy();
    // Keyed by position in the window, React would move "Item 52" into a node
    // that used to hold another row. Keyed by the item, the node stays put.
    expect(after).toBe(before);
    expect(after.textContent).toBe('Item 52');
  });

  it('renders at most a window of rows however far it scrolls', () => {
    const { calls } = renderList();
    calls.length = 0;
    scrollTo(150000);
    expect(calls.length).toBeLessThanOrEqual(12);
    expect(Math.min(...calls)).toBeGreaterThanOrEqual(7497);
  });
});

describe('VirtualList: edge cases', () => {
  it('renders every row when the list is shorter than the viewport', () => {
    renderList({ items: makeItems(3) });
    expect(positions()).toEqual([1, 2, 3]);
    expect(list().firstElementChild.style.height).toBe('60px');
  });

  it('renders no rows for an empty list', () => {
    renderList({ items: [] });
    expect(rows()).toHaveLength(0);
    expect(list()).toBeTruthy();
  });

  it('still shows the last rows when the list shrinks while scrolled far down', () => {
    const { rerender, props } = renderList();
    scrollTo(150000);
    rerender(<solution.VirtualList {...props} items={makeItems(20)} />);
    // 20 rows * 20px = 400px of content; the furthest you can scroll is 300px,
    // so rows 15-19 are on screen with 3 overscan above.
    expect(positions()).toEqual(range(12, 20));
    expect(rows().every((r) => r.getAttribute('aria-setsize') === '20')).toBe(true);
  });
});
