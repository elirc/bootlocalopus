const { createResourceCache, ProfilePage, ProfileSwitcher } = solution;

function createLoader() {
  const calls = [];
  const loader = (key) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ key, resolve, reject });
    return promise;
  };
  loader.calls = calls;
  loader.keys = () => calls.map((c) => c.key);
  loader.last = (key) => [...calls].reverse().find((c) => c.key === key);
  return loader;
}
const thrownBy = (fn) => { try { fn(); } catch (e) { return e; } return undefined; };
const settle = async (fn) => { await act(async () => { fn(); }); };
const flush = () => act(async () => {});

describe('createResourceCache', () => {
  it('suspends with a promise while loading, and loads once', () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    const first = thrownBy(() => resource.read('u1'));
    const second = thrownBy(() => resource.read('u1'));
    expect(typeof first?.then).toBe('function');
    expect(typeof second?.then).toBe('function');
    expect(loader.keys()).toEqual(['u1']);
  });

  it('returns the value once loaded', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    const pending = thrownBy(() => resource.read('u1'));
    loader.calls[0].resolve({ name: 'Ada' });
    await pending;
    expect(resource.read('u1')).toEqual({ name: 'Ada' });
    expect(resource.read('u1')).toBe(resource.read('u1'));
    expect(loader.calls).toHaveLength(1);
  });

  it('throws the error once failed', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    const pending = thrownBy(() => resource.read('u1'));
    const boom = new Error('404');
    loader.calls[0].reject(boom);
    await pending.then(() => {}, () => {});
    expect(thrownBy(() => resource.read('u1'))).toBe(boom);
    expect(loader.calls).toHaveLength(1);
  });

  it('caches per key', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    thrownBy(() => resource.read('u1'));
    thrownBy(() => resource.read('u2'));
    thrownBy(() => resource.read('u1'));
    expect(loader.keys()).toEqual(['u1', 'u2']);
  });

  it('preloads without suspending', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    expect(() => resource.preload('u1')).not.toThrow();
    resource.preload('u1');
    expect(loader.keys()).toEqual(['u1']);
    loader.calls[0].resolve('Ada');
    await flush();
    expect(resource.read('u1')).toBe('Ada');
    expect(loader.calls).toHaveLength(1);
  });

  it('invalidate makes the next read load again', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    resource.preload('u1');
    loader.calls[0].resolve('old');
    await flush();
    resource.invalidate('u1');
    const pending = thrownBy(() => resource.read('u1'));
    expect(typeof pending?.then).toBe('function');
    expect(loader.keys()).toEqual(['u1', 'u1']);
  });

  it('turns a synchronous loader throw into an error on read', async () => {
    const resource = createResourceCache(() => { throw new Error('bad key'); });
    const pending = thrownBy(() => resource.read('x'));
    if (pending && typeof pending.then === 'function') await pending.then(() => {}, () => {});
    expect(thrownBy(() => resource.read('x'))?.message).toBe('bad key');
  });
});

describe('ProfilePage', () => {
  it('shows the fallback, then the profile', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    render(<ProfilePage resource={resource} userId="u1" />);
    expect(screen.getByText('Loading profile…')).toBeTruthy();
    await settle(() => loader.calls[0].resolve({ name: 'Ada' }));
    expect(screen.getByRole('heading').textContent).toBe('Ada');
    expect(loader.calls).toHaveLength(1);
  });

  it('shows an error, and Try again reloads', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const loader = createLoader();
      const resource = createResourceCache(loader);
      render(<ProfilePage resource={resource} userId="u1" />);
      await settle(() => loader.calls[0].reject(new Error('503')));
      expect(screen.getByRole('alert').textContent).toBe('Could not load profile');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(loader.keys()).toEqual(['u1', 'u1']);
      expect(screen.getByText('Loading profile…')).toBeTruthy();
      await settle(() => loader.last('u1').resolve({ name: 'Ada' }));
      expect(screen.getByRole('heading').textContent).toBe('Ada');
    } finally {
      console.error = original;
    }
  });

  it('clears an error when the user changes', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const loader = createLoader();
      const resource = createResourceCache(loader);
      const { rerender } = render(<ProfilePage resource={resource} userId="u1" />);
      await settle(() => loader.calls[0].reject(new Error('503')));
      rerender(<ProfilePage resource={resource} userId="u2" />);
      await settle(() => loader.last('u2').resolve({ name: 'Grace' }));
      expect(screen.getByRole('heading').textContent).toBe('Grace');
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      console.error = original;
    }
  });
});

describe('ProfileSwitcher', () => {
  it('keeps the current profile visible and marks itself busy while the next one loads', async () => {
    const loader = createLoader();
    const resource = createResourceCache(loader);
    render(<ProfileSwitcher resource={resource} userIds={['u1', 'u2']} />);
    await settle(() => loader.calls[0].resolve({ name: 'Ada' }));
    const section = screen.getByRole('region', { name: 'Profile' });
    expect(section.getAttribute('aria-busy')).toBe('false');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show u2' })); });
    expect(screen.getByRole('heading').textContent).toBe('Ada');
    expect(screen.queryByText('Loading profile…')).toBeNull();
    expect(section.getAttribute('aria-busy')).toBe('true');

    await settle(() => loader.last('u2').resolve({ name: 'Grace' }));
    expect(screen.getByRole('heading').textContent).toBe('Grace');
    expect(section.getAttribute('aria-busy')).toBe('false');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show u1' })); });
    expect(screen.getByRole('heading').textContent).toBe('Ada');
    expect(loader.keys()).toEqual(['u1', 'u2']);
  });
});
