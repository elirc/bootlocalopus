const TABS = [
  { id: 'profile', label: 'Profile', content: 'Your name and photo' },
  { id: 'billing', label: 'Billing', content: 'Cards and invoices' },
  { id: 'team', label: 'Team', content: 'Members', disabled: true },
  { id: 'security', label: 'Security', content: 'Passwords and 2FA' },
];

const tab = (name) => screen.getByRole('tab', { name });
const selectedNames = () => screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent);
const press = (key) => fireEvent.keyDown(document.activeElement, { key });

/** Selected and focused: the two halves of automatic activation. */
function expectActive(name) {
  expect(selectedNames()).toEqual([name]);
  expect(document.activeElement).toBe(tab(name));
}

function renderTabs(props = {}) {
  const changes = [];
  render(<solution.Tabs label="Settings" tabs={TABS} onChange={(id) => changes.push(id)} {...props} />);
  return changes;
}

describe('structure', () => {
  it('is a named tablist whose selected tab controls a panel named after it', () => {
    renderTabs();
    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeTruthy();
    expect(selectedNames()).toEqual(['Profile']);
    expect(screen.getByRole('tabpanel', { name: 'Profile' }).textContent).toBe('Your name and photo');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('respects defaultTab', () => {
    renderTabs({ defaultTab: 'security' });
    expect(selectedNames()).toEqual(['Security']);
    expect(screen.getByRole('tabpanel', { name: 'Security' }).textContent).toBe('Passwords and 2FA');
  });

  it('only the selected tab is in the tab order', () => {
    renderTabs();
    fireEvent.click(tab('Billing'));
    const tabIndexes = screen.getAllByRole('tab').map((t) => [t.textContent, t.tabIndex]);
    expect(tabIndexes).toEqual([['Profile', -1], ['Billing', 0], ['Team', -1], ['Security', -1]]);
  });
});

describe('keyboard', () => {
  it('ArrowRight moves focus and selection together, skipping the disabled tab', () => {
    renderTabs();
    tab('Profile').focus();
    press('ArrowRight');
    expectActive('Billing');
    expect(screen.getByRole('tabpanel', { name: 'Billing' }).textContent).toBe('Cards and invoices');
    press('ArrowRight');
    expectActive('Security');
  });

  it('wraps around at both ends', () => {
    renderTabs({ defaultTab: 'security' });
    tab('Security').focus();
    press('ArrowRight');
    expectActive('Profile');
    press('ArrowLeft');
    expectActive('Security');
  });

  it('ArrowLeft skips the disabled tab too', () => {
    renderTabs({ defaultTab: 'security' });
    tab('Security').focus();
    press('ArrowLeft');
    expectActive('Billing');
  });

  it('Home and End jump to the first and last enabled tabs', () => {
    renderTabs({ defaultTab: 'billing' });
    tab('Billing').focus();
    press('End');
    expectActive('Security');
    press('Home');
    expectActive('Profile');
  });
});

describe('selection', () => {
  it('a disabled tab cannot be selected by clicking', () => {
    const changes = renderTabs();
    fireEvent.click(tab('Team'));
    expect(selectedNames()).toEqual(['Profile']);
    expect(changes).toEqual([]);
  });

  it('calls onChange only when the selection changes', () => {
    const changes = renderTabs();
    fireEvent.click(tab('Profile'));
    fireEvent.click(tab('Billing'));
    fireEvent.click(tab('Billing'));
    tab('Billing').focus();
    press('ArrowRight');
    expect(changes).toEqual(['billing', 'security']);
  });
});
