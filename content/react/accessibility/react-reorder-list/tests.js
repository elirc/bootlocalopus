const { ReorderList } = solution;

const initial = [
  { id: 'a', label: 'Apples' },
  { id: 'b', label: 'Bread' },
  { id: 'c', label: 'Cheese' },
  { id: 'd', label: 'Dates' },
];

function Harness({ start = initial, log = [] }) {
  const [items, setItems] = React.useState(start);
  return (
    <ReorderList
      items={items}
      label="Shopping list"
      onChange={(next) => { log.push(next); setItems(next); }}
    />
  );
}

const order = () => within(screen.getByRole('list', { name: 'Shopping list' }))
  .getAllByRole('listitem')
  .map((li) => li.textContent.replace(/[↑↓]/g, '').trim());
const btn = (name) => screen.getByRole('button', { name });
const press = (name) => { btn(name).focus(); fireEvent.click(btn(name)); };
const status = () => screen.getByRole('status').textContent;

describe('ReorderList markup', () => {
  it('renders a labelled list with named move buttons', () => {
    render(<Harness />);
    expect(order()).toEqual(['Apples', 'Bread', 'Cheese', 'Dates']);
    expect(btn('Move Bread up').tagName).toBe('BUTTON');
    expect(btn('Move Bread down').getAttribute('type')).toBe('button');
  });

  it('disables moving past either end', () => {
    render(<Harness />);
    expect(btn('Move Apples up').disabled).toBe(true);
    expect(btn('Move Apples down').disabled).toBe(false);
    expect(btn('Move Dates down').disabled).toBe(true);
    expect(btn('Move Dates up').disabled).toBe(false);
  });

  it('renders an empty status region up front', () => {
    render(<Harness />);
    expect(status()).toBe('');
  });
});

describe('ReorderList moving', () => {
  it('moves an item up and down', () => {
    render(<Harness />);
    press('Move Cheese up');
    expect(order()).toEqual(['Apples', 'Cheese', 'Bread', 'Dates']);
    press('Move Apples down');
    expect(order()).toEqual(['Cheese', 'Apples', 'Bread', 'Dates']);
  });

  it('hands the parent a new array and leaves the old one alone', () => {
    const log = [];
    const start = initial.slice();
    render(<Harness start={start} log={log} />);
    press('Move Bread down');
    expect(log).toHaveLength(1);
    expect(log[0]).not.toBe(start);
    expect(log[0].map((i) => i.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(start.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('announces where the item went', () => {
    render(<Harness />);
    press('Move Cheese up');
    expect(status()).toBe('Moved Cheese to position 2 of 4');
    press('Move Apples down');
    expect(status()).toBe('Moved Apples to position 2 of 4');
  });

  it('keeps focus on the same button so it can be pressed again', () => {
    render(<Harness />);
    press('Move Dates up');
    expect(document.activeElement).toBe(btn('Move Dates up'));
    fireEvent.click(document.activeElement);
    expect(order()).toEqual(['Apples', 'Dates', 'Bread', 'Cheese']);
    expect(document.activeElement).toBe(btn('Move Dates up'));
  });

  it('moves focus to the other button when the item reaches the top', () => {
    render(<Harness />);
    press('Move Bread up');
    expect(order()[0]).toBe('Bread');
    // The up button is disabled now; leaving focus on it strands the user.
    expect(btn('Move Bread up').disabled).toBe(true);
    expect(document.activeElement).toBe(btn('Move Bread down'));
    expect(status()).toBe('Moved Bread to position 1 of 4');
  });

  it('moves focus to the other button when the item reaches the bottom', () => {
    render(<Harness />);
    press('Move Cheese down');
    expect(order()[3]).toBe('Cheese');
    expect(document.activeElement).toBe(btn('Move Cheese up'));
    expect(status()).toBe('Moved Cheese to position 4 of 4');
  });

  it('works with a two-item list', () => {
    render(<Harness start={initial.slice(0, 2)} />);
    press('Move Bread up');
    expect(order()).toEqual(['Bread', 'Apples']);
    expect(document.activeElement).toBe(btn('Move Bread down'));
    fireEvent.click(document.activeElement);
    expect(order()).toEqual(['Apples', 'Bread']);
    expect(document.activeElement).toBe(btn('Move Bread up'));
    expect(status()).toBe('Moved Bread to position 2 of 2');
  });
});
