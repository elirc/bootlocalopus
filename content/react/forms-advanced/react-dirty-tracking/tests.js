const { ProfileForm } = solution;

const profile = { name: 'Ada', email: 'ada@example.com', newsletter: false };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const status = () => screen.getByRole('status').textContent;
const alertText = () => screen.getByRole('alert').textContent;
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const save = () => act(async () => { fireEvent.submit(field('Name').closest('form')); });

function setup() {
  const calls = [];
  let next = null;
  const onSave = (changes) => {
    calls.push(changes);
    next = deferred();
    return next.promise;
  };
  const utils = render(<ProfileForm profile={profile} onSave={onSave} />);
  return {
    ...utils,
    calls,
    resolve: () => act(async () => { next.resolve(); }),
    reject: () => act(async () => { next.reject(new Error('500')); }),
  };
}

describe('ProfileForm dirty state', () => {
  it('starts clean, showing the profile', () => {
    setup();
    expect(field('Name').value).toBe('Ada');
    expect(field('Send me the newsletter').checked).toBe(false);
    expect(status()).toBe('');
    expect(alertText()).toBe('');
  });

  it('is dirty after an edit, and clean again when the edit is undone', () => {
    setup();
    type('Name', 'Ada L');
    expect(status()).toBe('Unsaved changes');
    type('Name', 'Ada');
    expect(status()).toBe('');
  });

  it('tracks the checkbox too', () => {
    setup();
    fireEvent.click(field('Send me the newsletter'));
    expect(status()).toBe('Unsaved changes');
    fireEvent.click(field('Send me the newsletter'));
    expect(status()).toBe('');
  });

  it('keeps edits when the parent re-renders with an equal, new profile object', () => {
    const { rerender } = setup();
    type('Email', 'ada@new.dev');
    rerender(<ProfileForm profile={{ ...profile }} onSave={() => Promise.resolve()} />);
    expect(field('Email').value).toBe('ada@new.dev');
    expect(status()).toBe('Unsaved changes');
  });

  it('discards changes back to the baseline', () => {
    setup();
    type('Name', 'Grace');
    fireEvent.click(field('Send me the newsletter'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(field('Name').value).toBe('Ada');
    expect(field('Send me the newsletter').checked).toBe(false);
    expect(status()).toBe('');
  });
});

describe('ProfileForm saving', () => {
  it('does not call onSave when nothing changed', async () => {
    const { calls } = setup();
    type('Name', 'Ada L');
    type('Name', 'Ada');
    await save();
    expect(calls).toEqual([]);
    expect(status()).toBe('No changes to save');
  });

  it('sends only the changed fields', async () => {
    const { calls } = setup();
    type('Email', 'ada@new.dev');
    fireEvent.click(field('Send me the newsletter'));
    await save();
    expect(calls).toStrictEqual([{ email: 'ada@new.dev', newsletter: true }]);
  });

  it('shows Saving… and disables Save while in flight', async () => {
    const { resolve } = setup();
    type('Name', 'Grace');
    await save();
    expect(status()).toBe('Saving…');
    expect(saveButton().disabled).toBe(true);
    await resolve();
    expect(saveButton().disabled).toBe(false);
    expect(status()).toBe('All changes saved');
  });

  it('makes what was sent the new baseline', async () => {
    const { calls, resolve } = setup();
    type('Name', 'Grace');
    await save();
    await resolve();
    type('Name', 'Ada');
    // Ada is no longer the saved value, so this is a change now.
    expect(status()).toBe('Unsaved changes');
    await save();
    expect(calls[1]).toStrictEqual({ name: 'Ada' });
  });

  it('keeps edits made during the save dirty', async () => {
    const { calls, resolve } = setup();
    type('Name', 'Grace');
    await save();
    type('Email', 'grace@navy.mil');
    await resolve();
    expect(status()).toBe('Unsaved changes');
    await save();
    // Only the edit made during the first save is still unsaved.
    expect(calls[1]).toStrictEqual({ email: 'grace@navy.mil' });
  });

  it('keeps everything dirty and shows an alert when the save fails', async () => {
    const { calls, reject, resolve } = setup();
    type('Name', 'Grace');
    await save();
    await reject();
    expect(alertText()).toBe('Could not save your changes');
    expect(status()).toBe('Unsaved changes');
    expect(field('Name').value).toBe('Grace');
    await save();
    expect(alertText()).toBe('');
    expect(calls[1]).toStrictEqual({ name: 'Grace' });
    await resolve();
    expect(status()).toBe('All changes saved');
  });

  it('discards back to the saved values, not the original prop', async () => {
    const { resolve } = setup();
    type('Name', 'Grace');
    await save();
    await resolve();
    type('Name', 'Linus');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(field('Name').value).toBe('Grace');
  });
});
