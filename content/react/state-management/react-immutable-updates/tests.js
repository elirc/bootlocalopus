const { setIn, settingsReducer, NotificationSettings } = solution;

const make = () => ({
  profile: { name: 'Ada', address: { city: 'London', zip: 'N1' } },
  notifications: {
    email: { marketing: false, security: true },
    push: { marketing: false, security: true },
  },
});
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

describe('setIn', () => {
  it('sets a nested value without mutating the original', () => {
    const before = deepFreeze(make());
    const after = setIn(before, ['profile', 'address', 'city'], 'Paris');
    expect(after.profile.address.city).toBe('Paris');
    expect(before.profile.address.city).toBe('London');
    expect(after).toEqual({ ...make(), profile: { name: 'Ada', address: { city: 'Paris', zip: 'N1' } } });
  });

  it('copies the path and shares everything else', () => {
    const before = make();
    const after = setIn(before, ['profile', 'address', 'city'], 'Paris');
    expect(after).not.toBe(before);
    expect(after.profile).not.toBe(before.profile);
    expect(after.profile.address).not.toBe(before.profile.address);
    expect(after.notifications).toBe(before.notifications);
    expect(after.notifications.email).toBe(before.notifications.email);
  });

  it('returns the same object when the value is unchanged', () => {
    const before = deepFreeze(make());
    expect(setIn(before, ['notifications', 'push', 'security'], true)).toBe(before);
    expect(setIn(before, ['profile', 'address'], before.profile.address)).toBe(before);
  });

  it('creates missing intermediate objects', () => {
    const before = deepFreeze({ a: 1 });
    expect(setIn(before, ['b', 'c', 'd'], 2)).toEqual({ a: 1, b: { c: { d: 2 } } });
  });

  it('keeps arrays as arrays', () => {
    const tags = [{ label: 'x' }, { label: 'y' }];
    const before = deepFreeze({ tags });
    const after = setIn(before, ['tags', 1, 'label'], 'z');
    expect(Array.isArray(after.tags)).toBe(true);
    expect(after.tags).toEqual([{ label: 'x' }, { label: 'z' }]);
    expect(after.tags[0]).toBe(tags[0]);
    expect(after.tags).not.toBe(tags);
  });
});

describe('settingsReducer', () => {
  it('handles set', () => {
    const s = deepFreeze(make());
    const next = settingsReducer(s, { type: 'set', path: ['notifications', 'email', 'marketing'], value: true });
    expect(next.notifications.email.marketing).toBe(true);
    expect(next.notifications.push).toBe(s.notifications.push);
    expect(next.profile).toBe(s.profile);
  });

  it('handles toggleAll with structural sharing', () => {
    const s = deepFreeze(make());
    const next = settingsReducer(s, { type: 'toggleAll', channel: 'email', value: true });
    expect(next.notifications.email).toEqual({ marketing: true, security: true });
    expect(next.notifications.push).toBe(s.notifications.push);
    expect(next.profile).toBe(s.profile);
    const off = settingsReducer(next, { type: 'toggleAll', channel: 'push', value: false });
    expect(off.notifications.push).toEqual({ marketing: false, security: false });
    expect(off.notifications.email).toBe(next.notifications.email);
  });

  it('returns the same state when nothing changes', () => {
    const s = deepFreeze(make());
    const allOn = settingsReducer(s, { type: 'toggleAll', channel: 'email', value: true });
    expect(settingsReducer(allOn, { type: 'toggleAll', channel: 'email', value: true })).toBe(allOn);
    expect(settingsReducer(s, { type: 'set', path: ['profile', 'name'], value: 'Ada' })).toBe(s);
    expect(settingsReducer(s, { type: 'nope' })).toBe(s);
  });
});

describe('NotificationSettings', () => {
  const box = (name) => screen.getByRole('checkbox', { name });

  it('renders a fieldset per channel with one checkbox per key', () => {
    render(<NotificationSettings initial={make()} />);
    expect(screen.getAllByRole('group').map((g) => g.querySelector('legend').textContent)).toEqual(['email', 'push']);
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label')))
      .toEqual(['email marketing', 'email security', 'push marketing', 'push security']);
    expect(box('email security').checked).toBe(true);
    expect(box('email marketing').checked).toBe(false);
  });

  it('updates the checkbox, and re-renders only the section that changed', () => {
    const renders = [];
    const onRender = (channel) => renders.push(channel);
    render(<NotificationSettings initial={deepFreeze(make())} onRender={onRender} />);
    expect(renders).toEqual(['email', 'push']);
    fireEvent.click(box('email marketing'));
    expect(box('email marketing').checked).toBe(true);
    expect(renders).toEqual(['email', 'push', 'email']);
    fireEvent.click(box('push security'));
    expect(box('push security').checked).toBe(false);
    expect(box('email marketing').checked).toBe(true);
    expect(renders).toEqual(['email', 'push', 'email', 'push']);
  });
});
