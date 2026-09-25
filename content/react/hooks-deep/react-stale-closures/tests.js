function createFeed() {
  const handlers = new Set();
  const feed = {
    subscribes: 0,
    unsubscribes: 0,
    subscribe(handler) {
      feed.subscribes++;
      handlers.add(handler);
      return () => {
        feed.unsubscribes++;
        handlers.delete(handler);
      };
    },
    // Deliver payments in one tick (React batches them into one render).
    emit(...amounts) {
      act(() => {
        for (const amount of amounts) for (const h of [...handlers]) h({ amount });
      });
    },
    get live() { return handlers.size; },
  };
  return feed;
}

const total = () => screen.getByTestId('total').textContent;
const count = () => screen.getByTestId('count').textContent;

describe('LiveTotals', () => {
  it('starts at zero', () => {
    render(<solution.LiveTotals feed={createFeed()} limit={100} onOverLimit={() => {}} />);
    expect(total()).toBe('Total: 0');
    expect(count()).toBe('Count: 0');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accumulates payments delivered one at a time', () => {
    const feed = createFeed();
    render(<solution.LiveTotals feed={feed} limit={100} onOverLimit={() => {}} />);
    feed.emit(10);
    feed.emit(5);
    feed.emit(7);
    expect(total()).toBe('Total: 22');
    expect(count()).toBe('Count: 3');
  });

  it('accumulates several payments delivered in the same tick', () => {
    const feed = createFeed();
    render(<solution.LiveTotals feed={feed} limit={100} onOverLimit={() => {}} />);
    feed.emit(1, 2, 3);
    expect(total()).toBe('Total: 6');
    expect(count()).toBe('Count: 3');
  });

  it('adds three test payments from the button', () => {
    const feed = createFeed();
    render(<solution.LiveTotals feed={feed} limit={100} onOverLimit={() => {}} />);
    feed.emit(10);
    fireEvent.click(screen.getByRole('button', { name: 'Add 3 test payments' }));
    expect(total()).toBe('Total: 13');
    expect(count()).toBe('Count: 4');
  });

  it('subscribes once, however many payments arrive', () => {
    const feed = createFeed();
    const { unmount } = render(<solution.LiveTotals feed={feed} limit={100} onOverLimit={() => {}} />);
    feed.emit(1);
    feed.emit(2);
    fireEvent.click(screen.getByRole('button', { name: 'Add 3 test payments' }));
    expect(feed.subscribes).toBe(1);
    expect(feed.unsubscribes).toBe(0);
    unmount();
    expect(feed.live).toBe(0);
  });

  it('resubscribes when the feed changes', () => {
    const a = createFeed();
    const b = createFeed();
    const { rerender } = render(<solution.LiveTotals feed={a} limit={100} onOverLimit={() => {}} />);
    rerender(<solution.LiveTotals feed={b} limit={100} onOverLimit={() => {}} />);
    expect(a.live).toBe(0);
    expect(b.live).toBe(1);
    b.emit(4);
    expect(total()).toBe('Total: 4');
  });

  it('uses the current limit for the alert', () => {
    const feed = createFeed();
    const { rerender } = render(<solution.LiveTotals feed={feed} limit={10} onOverLimit={() => {}} />);
    feed.emit(8);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<solution.LiveTotals feed={feed} limit={5} onOverLimit={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('Over limit');
    rerender(<solution.LiveTotals feed={feed} limit={50} onOverLimit={() => {}} />);
    feed.emit(30);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calls onOverLimit once when the total crosses the limit', () => {
    const feed = createFeed();
    const calls = [];
    render(<solution.LiveTotals feed={feed} limit={10} onOverLimit={(t) => calls.push(t)} />);
    feed.emit(6);
    feed.emit(6);
    feed.emit(6);
    expect(calls).toEqual([12]);
  });

  it('uses the latest limit and the latest onOverLimit when crossing', () => {
    const feed = createFeed();
    const calls = [];
    const { rerender } = render(<solution.LiveTotals feed={feed} limit={10} onOverLimit={() => calls.push('old')} />);
    rerender(<solution.LiveTotals feed={feed} limit={100} onOverLimit={(t) => calls.push('new ' + t)} />);
    feed.emit(50);
    expect(calls).toEqual([]);
    feed.emit(60);
    expect(calls).toEqual(['new 110']);
    expect(feed.subscribes).toBe(1);
  });

  it('calls again after dropping back under and crossing again', () => {
    const feed = createFeed();
    const calls = [];
    const { rerender } = render(<solution.LiveTotals feed={feed} limit={10} onOverLimit={(t) => calls.push(t)} />);
    feed.emit(11);
    rerender(<solution.LiveTotals feed={feed} limit={20} onOverLimit={(t) => calls.push(t)} />);
    feed.emit(10);
    expect(calls).toEqual([11, 21]);
  });
});
