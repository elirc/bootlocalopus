function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A save whose calls are recorded and whose promises you settle one by one. */
function controlledSave() {
  const calls = [];
  const pending = [];
  const save = (next) => {
    calls.push(next);
    const d = deferred();
    pending.push(d);
    return d.promise;
  };
  return { save, calls, pending };
}

const count = () => screen.getByTestId('count').textContent;

describe('LikeButton', () => {
  it('updates label and count immediately, then saves once', () => {
    const { save, calls } = controlledSave();
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(count()).toBe('4');
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
    expect(calls).toEqual([true]);
  });

  it('cannot fire a second save while one is in flight', async () => {
    const { save, calls, pending } = controlledSave();
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    const button = screen.getByRole('button', { name: 'Unlike' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(calls).toEqual([true]);
    await act(async () => { pending[0].resolve(); });
    expect(screen.getByRole('button', { name: 'Unlike' }).disabled).toBe(false);
    expect(count()).toBe('4');
  });

  it('rolls back and shows an alert when the save fails', async () => {
    const { save, pending } = controlledSave();
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    await act(async () => { pending[0].reject(new Error('offline')); });
    expect(count()).toBe('3');
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Could not save. Try again.');
  });

  it('rolls an unlike back too', async () => {
    const { save, pending } = controlledSave();
    render(<solution.LikeButton initialLikes={10} initialLiked={true} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlike' }));
    expect(count()).toBe('9');
    await act(async () => { pending[0].reject(new Error('offline')); });
    expect(count()).toBe('10');
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
  });

  it('clears the alert on the next attempt, and it stays gone when that succeeds', async () => {
    const { save, pending } = controlledSave();
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    await act(async () => { pending[0].reject(new Error('offline')); });
    expect(screen.queryByRole('alert')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    await act(async () => { pending[1].resolve(); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(count()).toBe('4');
  });
});

/** A page with a trigger button that opens the modal; onClose closes it and is counted. */
function Page({ onCloseSpy = () => {} }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open settings</button>
      <solution.Modal open={open} onClose={() => { onCloseSpy(); setOpen(false); }} title="Settings">
        <label>Name <input /></label>
      </solution.Modal>
    </div>
  );
}

function openFromTrigger() {
  const trigger = screen.getByRole('button', { name: 'Open settings' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<solution.Modal open={false} onClose={() => {}} title="Settings">body</solution.Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a dialog named by its title, and takes focus when opened', () => {
    render(<Page />);
    openFromTrigger();
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Close calls onClose and focus returns to the trigger', () => {
    let closes = 0;
    render(<Page onCloseSpy={() => { closes++; }} />);
    const trigger = openFromTrigger();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(closes).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape anywhere closes it and focus returns to the trigger', () => {
    let closes = 0;
    render(<Page onCloseSpy={() => { closes++; }} />);
    const trigger = openFromTrigger();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closes).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
