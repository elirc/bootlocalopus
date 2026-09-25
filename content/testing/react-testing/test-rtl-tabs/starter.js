const TABS = [
  { id: 'profile', label: 'Profile', content: 'Your name and photo' },
  { id: 'billing', label: 'Billing', content: 'Cards and invoices' },
  { id: 'team', label: 'Team', content: 'Members', disabled: true },
  { id: 'security', label: 'Security', content: 'Passwords and 2FA' },
];

const tab = (name) => screen.getByRole('tab', { name });

describe('Tabs', () => {
  it('shows the first panel', () => {
    render(<solution.Tabs label="Settings" tabs={TABS} />);
    expect(screen.getByText('Your name and photo')).toBeTruthy();
  });

  it('switches on click', () => {
    render(<solution.Tabs label="Settings" tabs={TABS} />);
    fireEvent.click(tab('Billing'));
    expect(screen.getByText('Cards and invoices')).toBeTruthy();
  });

  // TODO: aria-selected, the named tabpanel, roving tabIndex, arrows (focus AND selection),
  // wrapping, Home/End, the disabled tab, and when onChange fires.
});
