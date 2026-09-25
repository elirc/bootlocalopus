const { UsernameForm } = solution;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A fake server: every call waits until the test answers it.
function fakeServer() {
  const calls = [];
  const waiting = new Map();
  const checkUsername = (name) => {
    calls.push(name);
    const d = deferred();
    if (!waiting.has(name)) waiting.set(name, []);
    waiting.get(name).push(d);
    return d.promise;
  };
  const answer = (name, available) => act(async () => { waiting.get(name).shift().resolve(available); });
  const fail = (name) => act(async () => { waiting.get(name).shift().reject(new Error('503')); });
  return { calls, checkUsername, answer, fail };
}

const MSG = {
  required: 'Username is required',
  format: 'Use 3–20 lowercase letters, numbers or underscores',
  checking: 'Checking…',
  available: 'Available',
  taken: 'That username is taken',
  failed: 'Could not check the username. Try again.',
};

const input = () => screen.getByLabelText('Username');
const message = () => document.getElementById(input().getAttribute('aria-describedby'));
const invalid = () => input().getAttribute('aria-invalid');
const type = (value) => fireEvent.change(input(), { target: { value } });
const blur = () => fireEvent.blur(input());
const submit = () => act(async () => { fireEvent.submit(input().closest('form')); });
const settle = () => act(async () => {});

function setup(onSubmit = () => {}) {
  const server = fakeServer();
  const submitted = [];
  render(<UsernameForm checkUsername={server.checkUsername} onSubmit={(v) => { submitted.push(v); return onSubmit(v); }} />);
  return { server, submitted };
}

describe('UsernameForm checking on blur', () => {
  it('renders an empty, linked message and makes no request while typing', () => {
    const { server } = setup();
    expect(message()).toBeTruthy();
    expect(message().textContent).toBe('');
    type('a');
    type('ad');
    type('ada');
    expect(server.calls).toEqual([]);
    expect(message().textContent).toBe('');
    expect(invalid()).toBeNull();
  });

  it('reports format problems on blur without asking the server', () => {
    const { server } = setup();
    blur();
    expect(message().textContent).toBe(MSG.required);
    expect(invalid()).toBe('true');
    type('Ada Lovelace');
    blur();
    expect(message().textContent).toBe(MSG.format);
    type('ab');
    blur();
    expect(message().textContent).toBe(MSG.format);
    expect(server.calls).toEqual([]);
  });

  it('checks a well-formed value on blur and shows the answer', async () => {
    const { server } = setup();
    type('ada');
    blur();
    expect(message().textContent).toBe(MSG.checking);
    expect(invalid()).toBeNull();
    expect(server.calls).toEqual(['ada']);
    await server.answer('ada', true);
    expect(message().textContent).toBe(MSG.available);
    expect(invalid()).toBeNull();
  });

  it('marks a taken username invalid', async () => {
    const { server } = setup();
    type('grace');
    blur();
    await server.answer('grace', false);
    expect(message().textContent).toBe(MSG.taken);
    expect(invalid()).toBe('true');
  });

  it('clears the message as soon as the value changes', async () => {
    const { server } = setup();
    type('grace');
    blur();
    await server.answer('grace', false);
    type('grace_h');
    expect(message().textContent).toBe('');
    expect(invalid()).toBeNull();
  });

  it('remembers answers: no second request, and the answer shows at once', async () => {
    const { server } = setup();
    type('grace');
    blur();
    await server.answer('grace', false);
    type('grace_h');
    type('grace');
    blur();
    expect(message().textContent).toBe(MSG.taken);
    expect(server.calls).toEqual(['grace']);
  });

  it('does not ask twice while a check is still pending', async () => {
    const { server } = setup();
    type('ada');
    blur();
    blur();
    expect(server.calls).toEqual(['ada']);
    expect(message().textContent).toBe(MSG.checking);
    await server.answer('ada', true);
    expect(message().textContent).toBe(MSG.available);
  });

  it('ignores a late answer for a value that is no longer in the field', async () => {
    const { server } = setup();
    type('ada');
    blur();
    type('ada_l');
    blur();
    await server.answer('ada_l', true);
    expect(message().textContent).toBe(MSG.available);
    await server.answer('ada', false);
    expect(message().textContent).toBe(MSG.available);
    expect(invalid()).toBeNull();
    // ...but it was still worth remembering.
    type('ada');
    blur();
    expect(message().textContent).toBe(MSG.taken);
    expect(server.calls).toEqual(['ada', 'ada_l']);
  });

  it('reports a failed check and asks again next time', async () => {
    const { server } = setup();
    type('ada');
    blur();
    await server.fail('ada');
    expect(message().textContent).toBe(MSG.failed);
    expect(invalid()).toBeNull();
    blur();
    expect(server.calls).toEqual(['ada', 'ada']);
    await server.answer('ada', true);
    expect(message().textContent).toBe(MSG.available);
  });
});

describe('UsernameForm submitting', () => {
  it('stops on a format problem and focuses the field', async () => {
    const { server, submitted } = setup();
    await submit();
    expect(message().textContent).toBe(MSG.required);
    expect(document.activeElement).toBe(input());
    expect(server.calls).toEqual([]);
    expect(submitted).toEqual([]);
  });

  it('checks a value that was never blurred, then submits it once', async () => {
    const { server, submitted } = setup();
    type('ada');
    await submit();
    expect(message().textContent).toBe(MSG.checking);
    expect(submitted).toEqual([]);
    await server.answer('ada', true);
    expect(submitted).toEqual([{ username: 'ada' }]);
    expect(server.calls).toEqual(['ada']);
  });

  it('does not submit a taken username, and focuses the field', async () => {
    const { server, submitted } = setup();
    type('grace');
    await submit();
    await server.answer('grace', false);
    expect(submitted).toEqual([]);
    expect(message().textContent).toBe(MSG.taken);
    expect(document.activeElement).toBe(input());
  });

  it('reuses the check that blur already started', async () => {
    const { server, submitted } = setup();
    type('ada');
    blur();
    await submit();
    await server.answer('ada', true);
    expect(server.calls).toEqual(['ada']);
    expect(submitted).toEqual([{ username: 'ada' }]);
  });

  it('submits straight away when the answer is already known', async () => {
    const { server, submitted } = setup();
    type('ada');
    blur();
    await server.answer('ada', true);
    await submit();
    expect(submitted).toEqual([{ username: 'ada' }]);
    expect(server.calls).toEqual(['ada']);
  });

  it('ignores a second submit while the first is waiting for the check', async () => {
    const { server, submitted } = setup();
    type('ada');
    await submit();
    await submit();
    await server.answer('ada', true);
    await settle();
    expect(submitted).toEqual([{ username: 'ada' }]);
    expect(server.calls).toEqual(['ada']);
  });

  it('ignores a second submit while onSubmit is still pending', async () => {
    const save = deferred();
    const { server, submitted } = setup(() => save.promise);
    type('ada');
    blur();
    await server.answer('ada', true);
    await submit();
    await submit();
    expect(submitted).toHaveLength(1);
    await act(async () => { save.resolve(); });
    await submit();
    expect(submitted).toHaveLength(2);
  });

  it('does not submit if the value changed while the check was pending', async () => {
    const { server, submitted } = setup();
    type('ada');
    await submit();
    type('ada_l');
    await server.answer('ada', true);
    expect(submitted).toEqual([]);
    expect(message().textContent).toBe('');
  });

  it('does not submit when the check fails', async () => {
    const { server, submitted } = setup();
    type('ada');
    await submit();
    await server.fail('ada');
    expect(submitted).toEqual([]);
    expect(message().textContent).toBe(MSG.failed);
  });
});
