const type = (label, value) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  return input;
};

describe('SignupForm', () => {
  it('renders labelled fields and a submit button', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy();
  });

  it('is controlled: typing updates the input value', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    const email = type('Email', 'ada@example.com');
    expect(email.value).toBe('ada@example.com');
  });

  it('disables submit until both fields are valid', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    const button = screen.getByRole('button', { name: 'Sign up' });
    expect(button.disabled).toBe(true);

    type('Email', 'ada@example.com');
    expect(button.disabled).toBe(true);

    type('Password', 'short');
    expect(button.disabled).toBe(true);

    type('Password', 'longenough');
    expect(button.disabled).toBe(false);
  });

  it('rejects an email with no @', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'not-an-email');
    type('Password', 'longenough');
    expect(screen.getByRole('button', { name: 'Sign up' }).disabled).toBe(true);
  });

  it('submits the values', () => {
    const seen = [];
    render(<solution.SignupForm onSubmit={(v) => seen.push(v)} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(seen).toEqual([{ email: 'ada@example.com', password: 'hunter2hunter2' }]);
  });

  it('clears the fields after submitting', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByLabelText('Email').value).toBe('');
    expect(screen.getByLabelText('Password').value).toBe('');
  });

  it('changing one field does not reset the other', () => {
    // Changing one field must not reset the other.
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    expect(screen.getByLabelText('Email').value).toBe('ada@example.com');
    expect(screen.getByLabelText('Password').value).toBe('hunter2hunter2');
  });

  it('prevents the default form submission', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    const form = screen.getByRole('button', { name: 'Sign up' }).closest('form');
    const event = new window.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});