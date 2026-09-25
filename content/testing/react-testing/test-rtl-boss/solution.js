const COUNTRIES = [
  { id: 'fr', label: 'France' },
  { id: 'fi', label: 'Finland' },
  { id: 'de', label: 'Germany' },
  { id: 'ie', label: 'Ireland' },
];

const input = () => screen.getByRole('combobox', { name: 'Country' });
const type = (text) => fireEvent.change(input(), { target: { value: text } });
const key = (k) => fireEvent.keyDown(input(), { key: k });
const optionTexts = () => screen.queryAllByRole('option').map((o) => o.textContent);
const expanded = () => input().getAttribute('aria-expanded');

function setup() {
  const selected = [];
  render(<solution.Combobox label="Country" options={COUNTRIES} onSelect={(o) => selected.push(o)} />);
  input().focus();
  return { selected };
}

/** The option the input says is active, the options marked selected, and focus: all three must agree. */
function expectHighlighted(label) {
  const marked = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
  expect(marked.map((o) => o.textContent)).toEqual([label]);
  const activeId = input().getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  expect(document.getElementById(activeId)).toBe(marked[0]);
  expect(document.activeElement).toBe(input());
}

function expectNothingHighlighted() {
  expect(input().getAttribute('aria-activedescendant')).toBeNull();
  const marked = screen.queryAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
  expect(marked).toEqual([]);
}

describe('filtering and aria-expanded', () => {
  it('starts closed', () => {
    setup();
    expect(expanded()).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters by contained text, ignoring case, and opens the list', () => {
    setup();
    type('  LAND ');
    expect(optionTexts()).toEqual(['Finland', 'Ireland']);
    expect(expanded()).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expectNothingHighlighted();
  });

  it('shows "No results" and no list when nothing matches', () => {
    setup();
    type('zz');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(expanded()).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('No results');
  });
});

describe('keyboard', () => {
  it('ArrowDown opens the list and highlights the first option', () => {
    setup();
    key('ArrowDown');
    expect(expanded()).toBe('true');
    expectHighlighted('France');
  });

  it('ArrowDown wraps from the last option to the first', () => {
    setup();
    type('land');
    key('ArrowDown');
    key('ArrowDown');
    expectHighlighted('Ireland');
    key('ArrowDown');
    expectHighlighted('Finland');
  });

  it('ArrowUp starts at the last option and wraps from the first', () => {
    setup();
    type('an');
    expect(optionTexts()).toEqual(['France', 'Finland', 'Germany', 'Ireland']);
    key('ArrowUp');
    expectHighlighted('Ireland');
    key('ArrowDown');
    key('ArrowUp');
    key('ArrowUp');
    expectHighlighted('Germany');
  });

  it('typing after a highlight clears it', () => {
    setup();
    type('land');
    key('ArrowDown');
    key('ArrowDown');
    type('lan');
    expectNothingHighlighted();
  });

  it('Enter with nothing highlighted does nothing', () => {
    const { selected } = setup();
    type('land');
    key('Enter');
    expect(selected).toEqual([]);
    expect(input().value).toBe('land');
    expect(expanded()).toBe('true');
  });
});

describe('choosing', () => {
  it('Enter chooses the highlighted option: value, closed list, onSelect once', () => {
    const { selected } = setup();
    type('land');
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    expect(input().value).toBe('Ireland');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(expanded()).toBe('false');
    expect(selected).toEqual([{ id: 'ie', label: 'Ireland' }]);
  });

  it('clicking an option chooses it', () => {
    const { selected } = setup();
    type('g');
    fireEvent.click(screen.getByRole('option', { name: 'Germany' }));
    expect(input().value).toBe('Germany');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(selected).toEqual([{ id: 'de', label: 'Germany' }]);
  });
});

describe('Escape', () => {
  it('first closes the list and keeps the text, then clears the text', () => {
    setup();
    type('fin');
    key('ArrowDown');
    key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(expanded()).toBe('false');
    expect(input().value).toBe('fin');
    expect(input().getAttribute('aria-activedescendant')).toBeNull();

    key('Escape');
    expect(input().value).toBe('');
  });
});
