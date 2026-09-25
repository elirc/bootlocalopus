const COUNTRIES = [
  { id: 'fr', label: 'France' },
  { id: 'fi', label: 'Finland' },
  { id: 'de', label: 'Germany' },
  { id: 'ie', label: 'Ireland' },
];

const input = () => screen.getByRole('combobox', { name: 'Country' });
const type = (text) => fireEvent.change(input(), { target: { value: text } });
const key = (k) => fireEvent.keyDown(input(), { key: k });

function setup() {
  const selected = [];
  render(<solution.Combobox label="Country" options={COUNTRIES} onSelect={(o) => selected.push(o)} />);
  input().focus();
  return { selected };
}

describe('Combobox', () => {
  it('filters as you type', () => {
    setup();
    type('fr');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['France']);
  });

  // TODO: aria-expanded, case, "No results", ArrowDown/ArrowUp (aria-selected AND
  // aria-activedescendant AND focus), wrapping, Enter with and without a highlight,
  // clicking, onSelect, typing after a highlight, Escape twice.
});
