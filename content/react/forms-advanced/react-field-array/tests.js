const { GuestList } = solution;

const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const nameLabels = () => screen.getAllByLabelText(/^Guest \d+ name$/).map((el) => el.value);

function setup() {
  const submitted = [];
  render(<GuestList onSubmit={(guests) => submitted.push(guests)} />);
  return submitted;
}

function threeGuests() {
  type('Guest 1 name', 'Ada');
  type('Guest 1 email', 'ada@example.com');
  click('Add guest');
  type('Guest 2 name', 'Grace');
  type('Guest 2 email', 'grace@example.com');
  click('Add guest');
  type('Guest 3 name', 'Linus');
  type('Guest 3 email', 'linus@example.com');
}

describe('GuestList rows', () => {
  it('starts with one empty row', () => {
    setup();
    expect(nameLabels()).toEqual(['']);
    expect(field('Guest 1 email').value).toBe('');
    expect(screen.getByRole('button', { name: 'Remove guest 1' })).toBeTruthy();
  });

  it('adds a row and focuses its name input', () => {
    setup();
    click('Add guest');
    expect(nameLabels()).toEqual(['', '']);
    expect(document.activeElement).toBe(field('Guest 2 name'));
  });

  it('removes the right row and renumbers the rest', () => {
    setup();
    threeGuests();
    click('Remove guest 2');
    expect(nameLabels()).toEqual(['Ada', 'Linus']);
    expect(field('Guest 2 email').value).toBe('linus@example.com');
  });

  it('keeps each guest in its own DOM nodes when a row above is removed', () => {
    setup();
    threeGuests();
    const linusName = field('Guest 3 name');
    const linusEmail = field('Guest 3 email');
    click('Remove guest 1');
    // With index keys, Linus's data would move into different <input>s.
    expect(field('Guest 2 name')).toBe(linusName);
    expect(field('Guest 2 email')).toBe(linusEmail);
    expect(linusName.value).toBe('Linus');
  });

  it('does not submit the form when adding or removing', () => {
    const submitted = setup();
    click('Add guest');
    click('Remove guest 2');
    expect(submitted).toEqual([]);
  });
});

describe('GuestList focus after removing', () => {
  it('focuses the row that took the removed row\'s place', () => {
    setup();
    threeGuests();
    click('Remove guest 2');
    expect(document.activeElement).toBe(field('Guest 2 name'));
    expect(document.activeElement.value).toBe('Linus');
  });

  it('focuses the new last row when the last row is removed', () => {
    setup();
    threeGuests();
    click('Remove guest 3');
    expect(document.activeElement).toBe(field('Guest 2 name'));
    expect(document.activeElement.value).toBe('Grace');
  });

  it('focuses the Add button when no rows are left', () => {
    setup();
    click('Remove guest 1');
    expect(screen.queryAllByLabelText(/^Guest \d+ name$/)).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }));
    click('Add guest');
    expect(document.activeElement).toBe(field('Guest 1 name'));
  });
});

describe('GuestList submitting', () => {
  it('submits trimmed guests in order, without ids', () => {
    const submitted = setup();
    threeGuests();
    type('Guest 2 name', '  Grace Hopper  ');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submitted).toStrictEqual([[
      { name: 'Ada', email: 'ada@example.com' },
      { name: 'Grace Hopper', email: 'grace@example.com' },
      { name: 'Linus', email: 'linus@example.com' },
    ]]);
  });

  it('leaves out rows that are blank after trimming, but keeps half-filled ones', () => {
    const submitted = setup();
    type('Guest 1 name', 'Ada');
    click('Add guest');
    type('Guest 2 name', '   ');
    click('Add guest');
    type('Guest 3 email', 'x@example.com');
    fireEvent.submit(field('Guest 1 name').closest('form'));
    expect(submitted).toStrictEqual([[
      { name: 'Ada', email: '' },
      { name: '', email: 'x@example.com' },
    ]]);
  });

  it('submits an empty array when every row is blank', () => {
    const submitted = setup();
    click('Add guest');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submitted).toStrictEqual([[]]);
  });
});
