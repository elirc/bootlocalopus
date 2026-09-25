const email = () => screen.getByLabelText('Email');
const password = () => screen.getByLabelText('Password');
const terms = () => screen.getByLabelText('I accept the terms');
const submitButton = () => screen.getByRole('button');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Fills the form; leave a key out to leave that field untouched. */
function fill({ email: e, password: p, terms: t } = {}) {
  if (e !== undefined) fireEvent.change(email(), { target: { value: e } });
  if (p !== undefined) fireEvent.change(password(), { target: { value: p } });
  if (t) fireEvent.click(terms());
}

/** The text of the element an input's aria-describedby points at, or null. */
function describedBy(input) {
  const id = input.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent ?? null : null;
}

const VALID = { email: 'ada@example.com', password: 'correct horse', terms: true };

describe('invalid submissions', () => {
  it('marks every invalid field and links it to its message', () => {
    const calls = [];
    render(<solution.SignupForm onSubmit={(v) => calls.push(v)} />);
    fireEvent.click(submitButton());

    expect(email().getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(email())).toBe('Enter a valid email address');
    expect(password().getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(password())).toBe('Password must be at least 8 characters');
    expect(terms().getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(terms())).toBe('You must accept the terms');
    expect(calls).toEqual([]);
  });

  it('moves focus to the first invalid field', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    fill({ email: 'not-an-email', password: 'long enough', terms: true });
    fireEvent.click(submitButton());
    expect(document.activeElement).toBe(email());
  });

  it('skips valid fields when choosing where to put focus', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    fill({ email: 'ada@example.com', password: 'short' });
    fireEvent.click(submitButton());
    expect(document.activeElement).toBe(password());
    expect(email().getAttribute('aria-invalid')).not.toBe('true');
  });

  it('requires the terms to be accepted', () => {
    const calls = [];
    render(<solution.SignupForm onSubmit={(v) => calls.push(v)} />);
    fill({ email: 'ada@example.com', password: 'long enough' });
    fireEvent.click(submitButton());
    expect(calls).toEqual([]);
    expect(document.activeElement).toBe(terms());
  });
});

describe('the password boundary', () => {
  it('rejects 7 characters', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    fill({ ...VALID, password: '1234567' });
    fireEvent.click(submitButton());
    expect(describedBy(password())).toBe('Password must be at least 8 characters');
  });

  it('accepts exactly 8 characters', async () => {
    const calls = [];
    render(<solution.SignupForm onSubmit={async (v) => { calls.push(v); }} />);
    fill({ ...VALID, password: '12345678' });
    await act(async () => { fireEvent.click(submitButton()); });
    expect(calls).toEqual([{ email: 'ada@example.com', password: '12345678' }]);
  });
});

describe('fixing an error', () => {
  it('clears the error as soon as the field is valid, without resubmitting', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    fireEvent.click(submitButton());
    expect(email().getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(email(), { target: { value: 'ada@example.com' } });
    expect(email().getAttribute('aria-invalid')).not.toBe('true');
    expect(describedBy(email())).toBe(null);
    expect(screen.queryByText('Enter a valid email address')).toBeNull();
  });
});

describe('valid submissions', () => {
  it('submits a trimmed email once, and ignores clicks while pending', async () => {
    const d = deferred();
    const calls = [];
    render(<solution.SignupForm onSubmit={(v) => { calls.push(v); return d.promise; }} />);
    fill({ ...VALID, email: '  ada@example.com  ' });
    fireEvent.click(submitButton());
    expect(submitButton().disabled).toBe(true);
    fireEvent.click(submitButton());
    expect(calls).toEqual([{ email: 'ada@example.com', password: 'correct horse' }]);

    await act(async () => { d.resolve(); });
    expect(submitButton().disabled).toBe(false);
  });

  it('shows the server error in an alert', async () => {
    render(<solution.SignupForm onSubmit={async () => { throw new Error('Email already registered'); }} />);
    fill(VALID);
    await act(async () => { fireEvent.click(submitButton()); });
    expect(screen.getByRole('alert').textContent).toBe('Email already registered');
  });
});
