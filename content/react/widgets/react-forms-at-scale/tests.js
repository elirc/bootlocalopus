function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const validateSignup = (v) => {
  const errors = {};
  if (!v.email.includes('@')) errors.email = 'Enter a valid email';
  if (!v.name.trim()) errors.name = 'Name is required';
  if (v.password.length < 8) errors.password = 'At least 8 characters';
  return errors;
};

// Key order is email, name, password. DOM order is name, email, password:
// "first invalid field" must follow the page, not the object.
function SignupForm({ onSubmit, validate = validateSignup }) {
  const form = solution.useForm({
    initialValues: { email: '', name: '', password: '' },
    validate,
    onSubmit,
  });
  const field = (name, label) => (
    <div>
      <label>
        {label}
        <input {...form.register(name)} />
      </label>
      <p {...form.errorProps(name)}>{form.errors[name] || ''}</p>
    </div>
  );
  return (
    <form aria-label="Sign up" onSubmit={form.handleSubmit}>
      {field('name', 'Name')}
      {field('email', 'Email')}
      {field('password', 'Password')}
      {form.formError && <p role="alert">{form.formError}</p>}
      <button type="submit" disabled={form.submitting}>Create account</button>
    </form>
  );
}

const input = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(input(label), { target: { value } });
const blur = (label) => fireEvent.blur(input(label));
const submit = () => fireEvent.submit(screen.getByRole('form', { name: 'Sign up' }));
const button = () => screen.getByRole('button', { name: 'Create account' });

/** The message a screen reader would hear for this input, via aria-describedby. */
function described(label) {
  const el = input(label);
  const id = el.getAttribute('aria-describedby');
  if (id === null) return null;
  const target = document.getElementById(id);
  assert(target !== null, label + ': aria-describedby="' + id + '" points at no element');
  return target.textContent;
}

const fillValid = () => {
  type('Name', 'Ada');
  type('Email', 'ada@example.com');
  type('Password', 'correct horse');
};

describe('when errors appear', () => {
  it('shows nothing at first', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    for (const label of ['Name', 'Email', 'Password']) {
      expect(input(label).getAttribute('aria-invalid')).toBeNull();
      expect(input(label).getAttribute('aria-describedby')).toBeNull();
    }
  });

  it('does not validate an untouched field while typing', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    type('Email', 'a');
    expect(input('Email').getAttribute('aria-invalid')).toBeNull();
    expect(described('Email')).toBeNull();
  });

  it('shows the error on blur, wired with aria-invalid and aria-describedby', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    type('Email', 'a');
    blur('Email');
    expect(input('Email').getAttribute('aria-invalid')).toBe('true');
    expect(described('Email')).toBe('Enter a valid email');
    // Only the blurred field.
    expect(input('Name').getAttribute('aria-invalid')).toBeNull();
  });

  it('then tracks every change once the field is touched', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    type('Email', 'a');
    blur('Email');
    type('Email', 'a@b');
    expect(input('Email').getAttribute('aria-invalid')).toBeNull();
    expect(input('Email').getAttribute('aria-describedby')).toBeNull();
    type('Email', 'ab');
    expect(input('Email').getAttribute('aria-invalid')).toBe('true');
    expect(described('Email')).toBe('Enter a valid email');
  });

  it('keeps the input controlled', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    type('Name', 'Grace');
    type('Email', 'g@h');
    expect(input('Name').value).toBe('Grace');
    expect(input('Email').value).toBe('g@h');
  });

  it('gives each form instance its own ids', () => {
    render(<div><SignupForm onSubmit={async () => {}} /><SignupForm onSubmit={async () => {}} /></div>);
    const [a, b] = screen.getAllByLabelText('Email');
    for (const el of [a, b]) {
      fireEvent.change(el, { target: { value: 'x' } });
      fireEvent.blur(el);
    }
    const ids = [a, b].map((el) => el.getAttribute('aria-describedby'));
    expect(ids[0] === ids[1]).toBe(false);
    expect(a.id === b.id).toBe(false);
    // Each points into its own form.
    expect(a.closest('form').contains(document.getElementById(ids[0]))).toBe(true);
    expect(b.closest('form').contains(document.getElementById(ids[1]))).toBe(true);
  });
});

describe('submitting with invalid values', () => {
  it('shows every error, does not call onSubmit, and focuses the first invalid field in document order', () => {
    let calls = 0;
    render(<SignupForm onSubmit={async () => { calls++; }} />);
    submit();
    expect(calls).toBe(0);
    expect(described('Name')).toBe('Name is required');
    expect(described('Email')).toBe('Enter a valid email');
    expect(described('Password')).toBe('At least 8 characters');
    expect(document.activeElement).toBe(input('Name'));
  });

  it('focuses the first field that is actually invalid', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    type('Name', 'Ada');
    type('Email', 'ada@example.com');
    type('Password', 'short');
    input('Name').focus();
    submit();
    expect(document.activeElement).toBe(input('Password'));
    expect(input('Name').getAttribute('aria-invalid')).toBeNull();
  });

  it('never disables the submit button just because the form is invalid', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    expect(button().disabled).toBe(false);
    submit();
    expect(button().disabled).toBe(false);
  });

  it('validates the whole form on submit even if nothing was blurred', () => {
    render(<SignupForm onSubmit={async () => {}} />);
    type('Name', 'Ada');
    submit();
    // Now touched: fixing a field clears its error without another blur.
    type('Email', 'ada@example.com');
    expect(input('Email').getAttribute('aria-invalid')).toBeNull();
    expect(input('Password').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('submitting valid values', () => {
  it('calls onSubmit once with the values and is disabled only while pending', async () => {
    const d = deferred();
    const calls = [];
    render(<SignupForm onSubmit={(values) => { calls.push(values); return d.promise; }} />);
    fillValid();
    submit();
    expect(calls).toEqual([{ name: 'Ada', email: 'ada@example.com', password: 'correct horse' }]);
    expect(button().disabled).toBe(true);
    await act(async () => { d.resolve(); });
    expect(button().disabled).toBe(false);
  });

  it('ignores a second submit while the first is pending', async () => {
    const d = deferred();
    let calls = 0;
    render(<SignupForm onSubmit={() => { calls++; return d.promise; }} />);
    fillValid();
    // Two submits before React has re-rendered (a programmatic double
    // requestSubmit, say): the second must still see the first in flight.
    act(() => { submit(); submit(); });
    submit();
    expect(calls).toBe(1);
    await act(async () => { d.resolve(); });
    await act(async () => { submit(); });
    expect(calls).toBe(2);
  });

  it('re-enables the button after a rejection', async () => {
    const d = deferred();
    render(<SignupForm onSubmit={() => d.promise} />);
    fillValid();
    submit();
    expect(button().disabled).toBe(true);
    await act(async () => { d.reject(new Error('Network down')); });
    expect(button().disabled).toBe(false);
  });

  it('uses the latest onSubmit the parent passed', async () => {
    const seen = [];
    const { rerender } = render(<SignupForm onSubmit={async () => { seen.push('first'); }} />);
    fillValid();
    rerender(<SignupForm onSubmit={async () => { seen.push('second'); }} />);
    await act(async () => { submit(); });
    expect(seen).toEqual(['second']);
  });
});

describe('server errors', () => {
  const conflict = (details) => Object.assign(new Error('Conflict'), { details });

  it('maps details onto fields and focuses the first one', async () => {
    const d = deferred();
    render(<SignupForm onSubmit={() => d.promise} />);
    fillValid();
    submit();
    await act(async () => { d.reject(conflict({ email: 'Email already taken', plan: 'not a field' })); });
    expect(input('Email').getAttribute('aria-invalid')).toBe('true');
    expect(described('Email')).toBe('Email already taken');
    expect(document.activeElement).toBe(input('Email'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('focuses the first server-invalid field in document order', async () => {
    const d = deferred();
    render(<SignupForm onSubmit={() => d.promise} />);
    fillValid();
    submit();
    await act(async () => { d.reject(conflict({ password: 'Too common', name: 'Reserved name' })); });
    expect(described('Name')).toBe('Reserved name');
    expect(described('Password')).toBe('Too common');
    expect(document.activeElement).toBe(input('Name'));
  });

  it('clears a field\'s server error when that field is edited', async () => {
    const d = deferred();
    render(<SignupForm onSubmit={() => d.promise} />);
    fillValid();
    submit();
    await act(async () => { d.reject(conflict({ email: 'Email already taken', name: 'Reserved name' })); });
    type('Email', 'ada2@example.com');
    expect(input('Email').getAttribute('aria-invalid')).toBeNull();
    expect(input('Email').getAttribute('aria-describedby')).toBeNull();
    // The other field keeps its server error.
    expect(described('Name')).toBe('Reserved name');
  });

  it('puts an unmapped failure in formError, cleared by the next attempt', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    render(<SignupForm onSubmit={() => queue.shift().promise} />);
    fillValid();
    submit();
    await act(async () => { first.reject(conflict({ plan: 'not a field' })); });
    expect(screen.getByRole('alert').textContent).toBe('Conflict');
    for (const label of ['Name', 'Email', 'Password']) {
      expect(input(label).getAttribute('aria-invalid')).toBeNull();
    }
    submit();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { second.resolve(); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('handles a rejection with no details at all', async () => {
    const d = deferred();
    render(<SignupForm onSubmit={() => d.promise} />);
    fillValid();
    submit();
    await act(async () => { d.reject(new Error('Service unavailable')); });
    expect(screen.getByRole('alert').textContent).toBe('Service unavailable');
    expect(button().disabled).toBe(false);
  });
});
