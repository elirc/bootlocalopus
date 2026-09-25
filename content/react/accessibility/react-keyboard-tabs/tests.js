const tabs = [
  { id: 'overview', label: 'Overview', content: 'Overview text' },
  { id: 'specs', label: 'Specs', content: 'Specs text' },
  { id: 'reviews', label: 'Reviews', content: 'Reviews text' },
  { id: 'faq', label: 'FAQ', content: 'FAQ text' },
];

const tab = (name) => screen.getByRole('tab', { name });
const allTabs = () => screen.getAllByRole('tab');
const panels = () => screen.getAllByRole('tabpanel', { hidden: true });
const selectedName = () => allTabs().filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent);
const tabStops = () => allTabs().filter((t) => t.tabIndex === 0).map((t) => t.textContent);
const visiblePanelText = () => panels().filter((p) => !p.hasAttribute('hidden')).map((p) => p.textContent);
const press = (key) => fireEvent.keyDown(document.activeElement, { key });

function setup(props = {}) {
  render(<solution.Tabs tabs={tabs} label="Product" {...props} />);
  tab('Overview').focus();
}

describe('Tabs structure', () => {
  it('renders a labelled tablist of tabs with the first selected', () => {
    setup();
    expect(screen.getByRole('tablist', { name: 'Product' })).toBeTruthy();
    expect(allTabs().map((t) => t.textContent)).toEqual(['Overview', 'Specs', 'Reviews', 'FAQ']);
    expect(selectedName()).toEqual(['Overview']);
    expect(tab('Specs').getAttribute('aria-selected')).toBe('false');
  });

  it('renders every panel, hiding all but the selected one', () => {
    setup();
    expect(panels()).toHaveLength(4);
    expect(visiblePanelText()).toEqual(['Overview text']);
    for (const p of panels()) expect(p.tabIndex).toBe(0);
  });

  it('wires each tab to its panel and back', () => {
    setup();
    for (const t of allTabs()) {
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      expect(panel).toBeTruthy();
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe(t.id);
    }
  });

  it('keeps ids unique across two tab sets with the same tab ids', () => {
    render(<div><solution.Tabs tabs={tabs} label="A" /><solution.Tabs tabs={tabs} label="B" /></div>);
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('makes the tablist a single Tab stop', () => {
    setup();
    expect(tabStops()).toEqual(['Overview']);
  });
});

describe('Tabs keyboard, automatic activation', () => {
  it('moves focus and selection right, wrapping at the end', () => {
    setup();
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('Specs'));
    expect(selectedName()).toEqual(['Specs']);
    expect(visiblePanelText()).toEqual(['Specs text']);
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('Overview'));
    expect(selectedName()).toEqual(['Overview']);
  });

  it('moves left, wrapping from the first to the last', () => {
    setup();
    press('ArrowLeft');
    expect(document.activeElement).toBe(tab('FAQ'));
    expect(selectedName()).toEqual(['FAQ']);
    press('ArrowLeft');
    expect(document.activeElement).toBe(tab('Reviews'));
  });

  it('jumps with Home and End, and prevents the page from scrolling', () => {
    setup();
    const notPrevented = fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(tab('FAQ'));
    press('Home');
    expect(document.activeElement).toBe(tab('Overview'));
    expect(selectedName()).toEqual(['Overview']);
  });

  it('moves the single tab stop with focus', () => {
    setup();
    press('ArrowRight');
    press('ArrowRight');
    expect(tabStops()).toEqual(['Reviews']);
  });

  it('ignores other keys', () => {
    setup();
    const notPrevented = fireEvent.keyDown(document.activeElement, { key: 'a' });
    expect(notPrevented).toBe(true);
    press('ArrowDown');
    expect(document.activeElement).toBe(tab('Overview'));
    expect(selectedName()).toEqual(['Overview']);
  });

  it('selects a clicked tab and moves the tab stop to it', () => {
    setup();
    fireEvent.click(tab('Reviews'));
    expect(selectedName()).toEqual(['Reviews']);
    expect(tabStops()).toEqual(['Reviews']);
    expect(visiblePanelText()).toEqual(['Reviews text']);
  });
});

describe('Tabs keyboard, manual activation', () => {
  it('moves focus and the tab stop without changing the selection', () => {
    setup({ activation: 'manual' });
    press('ArrowRight');
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('Reviews'));
    expect(tabStops()).toEqual(['Reviews']);
    expect(selectedName()).toEqual(['Overview']);
    expect(visiblePanelText()).toEqual(['Overview text']);
  });

  it('selects the focused tab when it is activated', () => {
    setup({ activation: 'manual' });
    press('End');
    fireEvent.click(document.activeElement);
    expect(selectedName()).toEqual(['FAQ']);
    expect(visiblePanelText()).toEqual(['FAQ text']);
    press('Home');
    expect(selectedName()).toEqual(['FAQ']);
    expect(tabStops()).toEqual(['Overview']);
  });
});
