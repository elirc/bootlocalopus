const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const count = () => screen.getByTestId('count').textContent;

describe('LikeButton', () => {
  it('renders the initial state', () => {
    render(<solution.LikeButton initialLikes={10} initialLiked={false} save={async () => {}} />);
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
    expect(count()).toBe('10');
  });

  it('renders the liked state', () => {
    render(<solution.LikeButton initialLikes={10} initialLiked save={async () => {}} />);
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
  });

  it('updates immediately, before the save resolves', async () => {
    const pending = deferred();
    render(<solution.LikeButton initialLikes={10} initialLiked={false} save={() => pending.promise} />);
    fireEvent.click(screen.getByRole('button'));
    // No await: the UI must already show the new value.
    expect(count()).toBe('11');
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
    await act(async () => { pending.resolve(); });
  });

  it('keeps the change when the save succeeds', async () => {
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('4');
    expect(screen.queryByText('Could not save. Try again.')).toBeNull();
  });

  it('decrements when unliking', async () => {
    render(<solution.LikeButton initialLikes={3} initialLiked save={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('2');
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
  });

  it('rolls back and reports when the save fails', async () => {
    render(
      <solution.LikeButton
        initialLikes={7}
        initialLiked={false}
        save={async () => { throw new Error('500'); }}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('7');
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
    expect(screen.getByText('Could not save. Try again.')).toBeTruthy();
  });

  it('rolls back an unlike too', async () => {
    render(
      <solution.LikeButton
        initialLikes={7}
        initialLiked
        save={async () => { throw new Error('500'); }}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('7');
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
  });

  it('disables the button while saving, then re-enables it', async () => {
    const pending = deferred();
    render(<solution.LikeButton initialLikes={1} initialLiked={false} save={() => pending.promise} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    await act(async () => { pending.resolve(); });
    expect(screen.getByRole('button').disabled).toBe(false);
  });

  it('does not double-fire when clicked twice quickly', async () => {
    let calls = 0;
    const pending = deferred();
    render(
      <solution.LikeButton
        initialLikes={1}
        initialLiked={false}
        save={() => { calls++; return pending.promise; }}
      />,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toBe(1);
    await act(async () => { pending.resolve(); });
  });

  it('re-enables after a failure so the user can retry', async () => {
    let attempt = 0;
    const save = async () => {
      attempt++;
      if (attempt === 1) throw new Error('flaky');
    };
    render(<solution.LikeButton initialLikes={5} initialLiked={false} save={save} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(screen.getByText('Could not save. Try again.')).toBeTruthy();
    expect(screen.getByRole('button').disabled).toBe(false);

    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('6');
    expect(screen.queryByText('Could not save. Try again.')).toBeNull();
  });

  it('passes the intended next value to save', async () => {
    const seen = [];
    render(
      <solution.LikeButton
        initialLikes={0}
        initialLiked={false}
        save={async (next) => { seen.push(next); }}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(seen).toEqual([true, false]);
  });
});