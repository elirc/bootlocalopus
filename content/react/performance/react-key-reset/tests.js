const contacts = [
  { id: 'c1', name: 'Ada', email: 'ada@example.com' },
  { id: 'c2', name: 'Grace', email: 'grace@example.com' },
  { id: 'c3', name: 'Linus', email: 'linus@example.com' },
];

const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const pick = (name) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Contacts' })).getByRole('button', { name }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

function setup() {
  const saved = [];
  render(<solution.ContactsApp contacts={contacts} onSave={(c) => saved.push(c)} />);
  return saved;
}

describe('typing', () => {
  it('keeps the same input element while typing', () => {
    setup();
    const input = field('Name');
    type('Name', 'Ad');
    type('Name', 'Ada L');
    // If the input is remounted on every keystroke, it is a different node.
    expect(field('Name')).toBe(input);
    expect(input.value).toBe('Ada L');
  });

  it('keeps focus in the field while typing', () => {
    setup();
    field('Email').focus();
    type('Email', 'ada@');
    type('Email', 'ada@lovelace.dev');
    expect(document.activeElement).toBe(field('Email'));
  });
});

describe('switching contacts', () => {
  it('starts on the first contact', () => {
    setup();
    expect(field('Name').value).toBe('Ada');
    expect(field('Email').value).toBe('ada@example.com');
  });

  it('shows the selected contact\'s values', () => {
    setup();
    pick('Grace');
    expect(field('Name').value).toBe('Grace');
    expect(field('Email').value).toBe('grace@example.com');
  });

  it('does not carry one contact\'s draft into another', () => {
    setup();
    type('Name', 'Ada Lovelace');
    pick('Linus');
    expect(field('Name').value).toBe('Linus');
    expect(field('Email').value).toBe('linus@example.com');
  });

  it('saves the contact on screen, not a stale draft', () => {
    const saved = setup();
    type('Name', 'Ada Lovelace');
    pick('Grace');
    save();
    // Saving Ada's typing onto Grace's id is the bug that corrupts data.
    expect(saved).toEqual([{ id: 'c2', name: 'Grace', email: 'grace@example.com' }]);
  });

  it('discards an unsaved draft when you switch away and back', () => {
    setup();
    type('Name', 'Ada Lovelace');
    pick('Grace');
    pick('Ada');
    expect(field('Name').value).toBe('Ada');
  });

  it('saves edits for the selected contact', () => {
    const saved = setup();
    pick('Grace');
    type('Email', 'grace@navy.mil');
    save();
    expect(saved).toEqual([{ id: 'c2', name: 'Grace', email: 'grace@navy.mil' }]);
  });

  it('marks the selected contact in the nav', () => {
    setup();
    pick('Linus');
    const nav = within(screen.getByRole('navigation', { name: 'Contacts' }));
    expect(nav.getByRole('button', { name: 'Linus' }).getAttribute('aria-current')).toBe('true');
    expect(nav.getByRole('button', { name: 'Ada' }).getAttribute('aria-current')).toBeNull();
  });
});
