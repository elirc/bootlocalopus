// Query like a user: by role and accessible name. No jest-dom: assert on the DOM directly.

/** A promise you settle by hand, so you can look at the in-between state. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('LikeButton', () => {
  it('shows the initial count and label', () => {
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={async () => {}} />);
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
  });

  // TODO: optimistic update, one save per click while in flight, rollback + alert, alert clears.
});

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<solution.Modal open={false} onClose={() => {}} title="Settings">body</solution.Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // TODO: focus moves in, Close and Escape call onClose, focus returns to the trigger.
  // Hint: a small wrapper with React.useState and a trigger button gives you a real open/close cycle.
});
