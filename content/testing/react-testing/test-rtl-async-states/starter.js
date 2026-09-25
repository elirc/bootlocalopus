/** A promise you settle by hand. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const field = () => screen.getByLabelText('Search users');
const searchFor = (text) => {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};

describe('UserSearch', () => {
  it('shows results', async () => {
    render(<solution.UserSearch search={async () => [{ id: 1, name: 'Ann Lee' }]} />);
    await act(async () => { searchFor('ann'); });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ann Lee']);
  });

  // TODO: loading, empty, error + Retry (which query?), blank and padded input,
  // and two searches that settle in the wrong order.
});
