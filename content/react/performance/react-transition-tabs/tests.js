// A tiny Suspense resource the test controls: a panel suspends until the
// test resolves its id.
function createPanels() {
  const entries = new Map();
  const entry = (id) => {
    if (!entries.has(id)) {
      let settle;
      const e = { status: 'pending', value: undefined, reads: 0 };
      e.promise = new Promise((resolve) => { settle = resolve; });
      e.resolve = (value) => { e.status = 'done'; e.value = value; settle(); };
      entries.set(id, e);
    }
    return entries.get(id);
  };
  function Panel({ id }) {
    const e = entry(id);
    e.reads++;
    if (e.status === 'pending') throw e.promise;
    return <p>{e.value}</p>;
  }
  return {
    renderPanel: (id) => <Panel id={id} />,
    resolve: (id, value) => act(async () => { entry(id).resolve(value); }),
    preload: (id, value) => entry(id).resolve(value),
  };
}

const tabs = [
  { id: 'about', label: 'About' },
  { id: 'photos', label: 'Photos' },
  { id: 'settings', label: 'Settings' },
];

const tab = (name) => screen.getByRole('tab', { name });
const tablist = () => screen.getByRole('tablist', { name: 'Profile' });
const panelText = () => screen.getByRole('tabpanel').textContent;
const busy = () => tablist().getAttribute('aria-busy');

function setup() {
  const panels = createPanels();
  render(<solution.TabbedView tabs={tabs} renderPanel={panels.renderPanel} label="Profile" />);
  return panels;
}

describe('TabbedView', () => {
  it('renders a labelled tablist with the first tab selected', () => {
    const panels = setup();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(tab('About').getAttribute('aria-selected')).toBe('true');
    expect(tab('Photos').getAttribute('aria-selected')).toBe('false');
    expect(tablist()).toBeTruthy();
    return panels.resolve('about', 'About content');
  });

  it('shows the fallback on first load, when there is nothing to keep', async () => {
    const panels = setup();
    expect(panelText()).toBe('Loading…');
    await panels.resolve('about', 'About content');
    expect(panelText()).toBe('About content');
  });

  it('keeps the current panel on screen while the next one loads', async () => {
    const panels = setup();
    await panels.resolve('about', 'About content');
    fireEvent.click(tab('Photos'));
    // Without a transition React has to show the nearest fallback, and the
    // content the user was reading flashes away to a spinner.
    expect(panelText()).toBe('About content');
    expect(screen.queryByText('Loading…')).toBeNull();
    await panels.resolve('photos', 'Photo grid');
    expect(panelText()).toBe('Photo grid');
  });

  it('marks the tablist busy while the switch is pending, and not after', async () => {
    const panels = setup();
    await panels.resolve('about', 'About content');
    expect(busy() === null || busy() === 'false').toBe(true);
    fireEvent.click(tab('Photos'));
    expect(busy()).toBe('true');
    await panels.resolve('photos', 'Photo grid');
    expect(busy() === null || busy() === 'false').toBe(true);
  });

  it('moves the selection only once the new panel can show', async () => {
    const panels = setup();
    await panels.resolve('about', 'About content');
    fireEvent.click(tab('Photos'));
    expect(tab('About').getAttribute('aria-selected')).toBe('true');
    await panels.resolve('photos', 'Photo grid');
    expect(tab('Photos').getAttribute('aria-selected')).toBe('true');
    expect(tab('About').getAttribute('aria-selected')).toBe('false');
  });

  it('switches straight away to a panel that is already loaded', async () => {
    const panels = setup();
    panels.preload('settings', 'Settings form');
    await panels.resolve('about', 'About content');
    await act(async () => { fireEvent.click(tab('Settings')); });
    expect(panelText()).toBe('Settings form');
    expect(tab('Settings').getAttribute('aria-selected')).toBe('true');
  });

  it('lands on the last tab clicked when switches overlap', async () => {
    const panels = setup();
    await panels.resolve('about', 'About content');
    fireEvent.click(tab('Photos'));
    fireEvent.click(tab('Settings'));
    expect(panelText()).toBe('About content');
    await panels.resolve('settings', 'Settings form');
    expect(panelText()).toBe('Settings form');
    await panels.resolve('photos', 'Photo grid');
    expect(panelText()).toBe('Settings form');
    expect(tab('Settings').getAttribute('aria-selected')).toBe('true');
  });
});
