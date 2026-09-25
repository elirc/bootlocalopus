const { createReducer, combineReducers, createAction } = solution;

// Built lazily, so an unfinished createAction fails tests instead of the whole file.
let built;
function fixtures() {
  if (built) return built;
  const todoAdded = createAction('todos/added', (text) => ({ payload: { text, done: false }, meta: { source: 'ui' } }));
  const filterSet = createAction('filter/set');

  const todos = createReducer([], {
    [todoAdded]: (state, action) => [...state, action.payload],
    'todos/cleared': () => [],
  });
  const filter = createReducer('all', {
    [filterSet]: (_state, action) => action.payload,
  });
  const session = createReducer({ user: null }, {
    'session/login': (state, action) => ({ ...state, user: action.payload }),
  });
  built = { todoAdded, filterSet, todos, filter, session };
  return built;
}

function thrown(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

describe('createAction', () => {
  it('builds { type, payload } and exposes the type', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    expect(filterSet('done')).toEqual({ type: 'filter/set', payload: 'done' });
    expect(filterSet.type).toBe('filter/set');
    expect(String(filterSet)).toBe('filter/set');
    expect(`${todoAdded}`).toBe('todos/added');
  });

  it('uses prepare to shape the action', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    expect(todoAdded('milk')).toEqual({ type: 'todos/added', payload: { text: 'milk', done: false }, meta: { source: 'ui' } });
  });

  it('match() checks the type', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    expect(filterSet.match({ type: 'filter/set', payload: 1 })).toBe(true);
    expect(filterSet.match(todoAdded('x'))).toBe(false);
  });
});

describe('createReducer', () => {
  it('starts from the initial state and runs matching handlers', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    let s = todos(undefined, { type: '@@init' });
    expect(s).toEqual([]);
    s = todos(s, todoAdded('milk'));
    expect(s).toEqual([{ text: 'milk', done: false }]);
    expect(todos(s, { type: 'todos/cleared' })).toEqual([]);
  });

  it('returns the same state for unknown actions', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const s = [{ text: 'a' }];
    expect(todos(s, { type: 'something/else' })).toBe(s);
  });

  it('only looks at own handlers', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const s = [];
    expect(todos(s, { type: 'toString' })).toBe(s);
    expect(todos(s, { type: 'constructor' })).toBe(s);
    expect(todos(s, { type: 'hasOwnProperty' })).toBe(s);
  });

  it('throws a TypeError naming the action when a handler returns undefined', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const broken = createReducer(0, { 'count/add': (state, action) => { state + action.payload; } });
    const e = thrown(() => broken(0, { type: 'count/add', payload: 1 }));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toContain('count/add');
  });

  it('allows a handler to return null', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const r = createReducer({ id: 1 }, { 'x/reset': () => null });
    expect(r(undefined, { type: 'x/reset' })).toBeNull();
  });
});

describe('combineReducers', () => {
  const root = (...args) => { const { todos, filter, session } = fixtures(); return combineReducers({ todos, filter, session })(...args); };

  it('builds the initial state from every slice', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    expect(root(undefined, { type: '@@init' })).toEqual({ todos: [], filter: 'all', session: { user: null } });
  });

  it('returns the same state when no slice changed', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const s = root(undefined, { type: '@@init' });
    expect(root(s, { type: 'unknown' })).toBe(s);
    expect(root(s, filterSet('all'))).toBe(s); // the handler returned an equal primitive
  });

  it('replaces only the slice that changed', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const s = root(undefined, { type: '@@init' });
    const next = root(s, todoAdded('milk'));
    expect(next).not.toBe(s);
    expect(next.todos).toEqual([{ text: 'milk', done: false }]);
    expect(next.session).toBe(s.session);
    expect(next.filter).toBe('all');
    expect(s.todos).toEqual([]);
  });

  it('passes every action to every slice', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const seen = [];
    const spy = (name) => (state = 0, action) => { seen.push([name, action.type]); return state; };
    const r = combineReducers({ a: spy('a'), b: spy('b') });
    r(undefined, { type: 'ping' });
    expect(seen).toEqual([['a', 'ping'], ['b', 'ping']]);
  });

  it('drops keys it has no reducer for, which counts as a change', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const s = { todos: [], filter: 'all', session: { user: null }, legacy: true };
    const next = root(s, { type: 'unknown' });
    expect(next).not.toBe(s);
    expect(Object.keys(next).sort()).toEqual(['filter', 'session', 'todos']);
    expect(next.todos).toBe(s.todos);
  });

  it('throws an Error naming the slice when a slice returns undefined', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const bad = combineReducers({ good: filter, broken: (state) => state });
    const e = thrown(() => bad(undefined, { type: '@@init' }));
    expect(e.message).toContain('broken');
  });

  it('nests', () => {
    const { todoAdded, filterSet, todos, filter, session } = fixtures();
    const app = combineReducers({ data: combineReducers({ todos }), ui: combineReducers({ filter }) });
    const s = app(undefined, { type: '@@init' });
    expect(s).toEqual({ data: { todos: [] }, ui: { filter: 'all' } });
    expect(app(s, { type: 'noop' })).toBe(s);
    const next = app(s, filterSet('done'));
    expect(next.ui.filter).toBe('done');
    expect(next.data).toBe(s.data);
  });
});
