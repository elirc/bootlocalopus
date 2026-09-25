const { lens, prop, find, compose, path, view, set, over } = solution;

const makeState = () => ({
  user: { name: 'ada', prefs: { theme: 'dark' } },
  todos: [
    { id: 1, title: 'milk', done: false },
    { id: 2, title: ' write lessons ', done: false },
    { id: 3, title: 'ship', done: true },
  ],
  meta: { version: 3 },
});
const byId = (id) => (t) => t.id === id;
const titleOf = (id) => compose(prop('todos'), find(byId(id)), prop('title'));

describe('prop', () => {
  it('reads and writes one level without mutating', () => {
    const s = makeState();
    expect(view(prop('meta'), s)).toBe(s.meta);
    const next = set(prop('meta'), { version: 4 }, s);
    expect(next.meta).toEqual({ version: 4 });
    expect(s.meta.version).toBe(3);
    expect(next.user).toBe(s.user);
  });

  it('works on arrays and keeps them arrays', () => {
    const arr = ['a', 'b', 'c'];
    const next = set(prop(1), 'B', arr);
    expect(next).toEqual(['a', 'B', 'c']);
    expect(Array.isArray(next)).toBe(true);
    expect(arr).toEqual(['a', 'b', 'c']);
  });

  it('get of null or undefined is undefined; set starts from {} or []', () => {
    expect(view(prop('x'), null)).toBeUndefined();
    expect(view(prop('x'), undefined)).toBeUndefined();
    expect(set(prop('x'), 1, undefined)).toEqual({ x: 1 });
    const arr = set(prop(0), 'first', null);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toEqual(['first']);
  });

  it('returns the same object when the value is already there', () => {
    const s = makeState();
    expect(set(prop('user'), s.user, s)).toBe(s);
    const withNaN = { n: NaN };
    expect(set(prop('n'), NaN, withNaN)).toBe(withNaN);
  });

  it('setting undefined on a missing key is a real change', () => {
    const obj = { a: 1 };
    const next = set(prop('b'), undefined, obj);
    expect(next).not.toBe(obj);
    expect(Object.hasOwn(next, 'b')).toBe(true);
  });
});

describe('find', () => {
  it('focuses the first matching element', () => {
    const s = makeState();
    expect(view(find(byId(2)), s.todos)).toBe(s.todos[1]);
    expect(view(find((t) => t.done === false), s.todos)).toBe(s.todos[0]);
    expect(view(find(byId(99)), s.todos)).toBeUndefined();
  });

  it('replaces the match in a copy', () => {
    const s = makeState();
    const replacement = { id: 3, title: 'shipped', done: true };
    const next = set(find(byId(3)), replacement, s.todos);
    expect(next[2]).toBe(replacement);
    expect(next[0]).toBe(s.todos[0]);
    expect(s.todos[2].title).toBe('ship');
  });

  it('returns the same array when nothing matches or nothing changes', () => {
    const s = makeState();
    expect(set(find(byId(99)), { id: 99 }, s.todos)).toBe(s.todos);
    expect(set(find(byId(1)), s.todos[0], s.todos)).toBe(s.todos);
  });
});

describe('compose and path', () => {
  it('focuses through several lenses', () => {
    const s = makeState();
    expect(view(titleOf(2), s)).toBe(' write lessons ');
    expect(view(path(['user', 'prefs', 'theme']), s)).toBe('dark');
    expect(view(path(['todos', 0, 'id']), s)).toBe(1);
  });

  it('copies only the path to a change', () => {
    const s = makeState();
    const next = set(titleOf(2), 'write lessons', s);
    expect(next.todos[1]).toEqual({ id: 2, title: 'write lessons', done: false });
    expect(next).not.toBe(s);
    expect(next.todos).not.toBe(s.todos);
    expect(next.todos[0]).toBe(s.todos[0]);
    expect(next.todos[2]).toBe(s.todos[2]);
    expect(next.user).toBe(s.user);
    expect(next.meta).toBe(s.meta);
    expect(s.todos[1].title).toBe(' write lessons ');
  });

  it('a no-op set returns the original whole', () => {
    const s = makeState();
    expect(set(titleOf(1), 'milk', s)).toBe(s);
    expect(set(path(['user', 'prefs', 'theme']), 'dark', s)).toBe(s);
    expect(set(titleOf(99), 'nothing to focus', s)).toBe(s);
  });

  it('path creates missing objects and arrays', () => {
    const next = set(path(['settings', 'columns', 0, 'width']), 120, {});
    expect(next).toEqual({ settings: { columns: [{ width: 120 }] } });
    expect(Array.isArray(next.settings.columns)).toBe(true);
  });

  it('compose() is the identity lens', () => {
    const s = makeState();
    expect(view(compose(), s)).toBe(s);
    expect(set(compose(), 42, s)).toBe(42);
  });

  it('works with hand-built lenses', () => {
    const celsius = lens((f) => ((f - 32) * 5) / 9, (c) => (c * 9) / 5 + 32);
    const temp = compose(prop('weather'), prop('fahrenheit'), celsius);
    const s = { weather: { fahrenheit: 212 } };
    expect(view(temp, s)).toBe(100);
    expect(set(temp, 0, s)).toEqual({ weather: { fahrenheit: 32 } });
  });
});

describe('the lens laws', () => {
  const lawLenses = () => [prop('meta'), path(['user', 'prefs', 'theme']), titleOf(3), path(['todos', 1, 'done'])];
  it('get after set gives what you set', () => {
    for (const l of lawLenses()) expect(view(l, set(l, 'v', makeState()))).toBe('v');
  });
  it('setting what is there changes nothing', () => {
    for (const l of lawLenses()) {
      const s = makeState();
      expect(set(l, view(l, s), s)).toBe(s);
    }
  });
  it('the last set wins', () => {
    for (const l of lawLenses()) {
      const s = makeState();
      expect(set(l, 'b', set(l, 'a', s))).toEqual(set(l, 'b', s));
    }
  });
});

describe('over and currying', () => {
  it('over applies a function to the focus', () => {
    const s = makeState();
    const next = over(titleOf(2), (t) => t.trim(), s);
    expect(view(titleOf(2), next)).toBe('write lessons');
    expect(next.todos[0]).toBe(s.todos[0]);
    expect(over(path(['meta', 'version']), (v) => v + 1, s).meta.version).toBe(4);
    expect(over(path(['stats', 'visits']), (v) => (v ?? 0) + 1, s).stats).toEqual({ visits: 1 });
  });

  it('leaving off the whole returns a function of the whole', () => {
    const s = makeState();
    const trimTitle = over(titleOf(2), (t) => t.trim());
    expect(typeof trimTitle).toBe('function');
    expect(view(titleOf(2), trimTitle(s))).toBe('write lessons');
    const markDone = set(path(['todos', 0, 'done']), true);
    expect(markDone(s).todos[0].done).toBe(true);
    const getTheme = view(path(['user', 'prefs', 'theme']));
    expect(getTheme(s)).toBe('dark');
    expect([s, makeState()].map(getTheme)).toEqual(['dark', 'dark']);
  });

  it('set with an explicit undefined value is not the curried form', () => {
    const s = { a: 1 };
    const next = set(prop('a'), undefined, s);
    expect(typeof next).toBe('object');
    expect(next).toStrictEqual({ a: undefined });
  });
});
