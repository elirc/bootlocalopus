const items = [
  { id: 'ship', title: 'Shipping times', content: 'Two to four working days.' },
  { id: 'returns', title: 'Returns', content: 'Within 30 days, unused.' },
  { id: 'warranty', title: 'Warranty', content: 'Two years on all parts.' },
];

const header = (name) => screen.getByRole('button', { name });
const panelFor = (button) => document.getElementById(button.getAttribute('aria-controls'));
const expanded = (name) => header(name).getAttribute('aria-expanded');

describe('Accordion structure', () => {
  it('renders a real button inside a heading for each item', () => {
    render(<solution.Accordion items={items} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Shipping times', 'Returns', 'Warranty']);
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.parentElement.tagName).toBe('H3');
    }
  });

  it('starts collapsed, with every panel present but hidden', () => {
    render(<solution.Accordion items={items} />);
    for (const item of items) {
      expect(expanded(item.title)).toBe('false');
      const panel = panelFor(header(item.title));
      expect(panel).toBeTruthy();
      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(panel.textContent).toBe(item.content);
    }
  });

  it('labels each panel as a region named by its header', () => {
    render(<solution.Accordion items={items} />);
    const button = header('Returns');
    const panel = panelFor(button);
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe(button.id);
    expect(button.id).toBeTruthy();
  });

  it('keeps ids unique when two accordions share item ids', () => {
    render(
      <div>
        <solution.Accordion items={items} />
        <solution.Accordion items={items} />
      </div>,
    );
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    const [first, second] = screen.getAllByRole('button', { name: 'Returns' });
    expect(panelFor(first)).not.toBe(panelFor(second));
    fireEvent.click(second);
    expect(panelFor(second).hasAttribute('hidden')).toBe(false);
    expect(panelFor(first).hasAttribute('hidden')).toBe(true);
  });
});

describe('Accordion behaviour', () => {
  it('toggles a section open and closed', () => {
    render(<solution.Accordion items={items} />);
    fireEvent.click(header('Returns'));
    expect(expanded('Returns')).toBe('true');
    expect(panelFor(header('Returns')).hasAttribute('hidden')).toBe(false);
    fireEvent.click(header('Returns'));
    expect(expanded('Returns')).toBe('false');
    expect(panelFor(header('Returns')).hasAttribute('hidden')).toBe(true);
  });

  it('closes the open section when another opens, by default', () => {
    render(<solution.Accordion items={items} />);
    fireEvent.click(header('Shipping times'));
    fireEvent.click(header('Warranty'));
    expect(expanded('Shipping times')).toBe('false');
    expect(expanded('Warranty')).toBe('true');
    expect(panelFor(header('Shipping times')).hasAttribute('hidden')).toBe(true);
  });

  it('opens sections independently with allowMultiple', () => {
    render(<solution.Accordion items={items} allowMultiple />);
    fireEvent.click(header('Shipping times'));
    fireEvent.click(header('Warranty'));
    expect(expanded('Shipping times')).toBe('true');
    expect(expanded('Warranty')).toBe('true');
    fireEvent.click(header('Shipping times'));
    expect(expanded('Shipping times')).toBe('false');
    expect(expanded('Warranty')).toBe('true');
  });

  it('does not submit a surrounding form', () => {
    let submits = 0;
    render(
      <form onSubmit={(e) => { e.preventDefault(); submits++; }}>
        <solution.Accordion items={items} />
      </form>,
    );
    fireEvent.click(header('Returns'));
    expect(submits).toBe(0);
    expect(expanded('Returns')).toBe('true');
  });
});
