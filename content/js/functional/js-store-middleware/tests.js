const { createStore, thunk } = solution;

const counter = (state = { count: 0 }, action) => {
  switch (action.type) {
    case 'inc': return { count: state.count + 1 };
    case 'add': return { count: state.count + action.payload };
    case 'boom': throw new Error('reducer exploded');
    default: return state;
  }
};

function thrown(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

describe('state and dispatch', () => {
  it('initialises through the reducer, with or without preloaded state', () => {
    const seen = [];
    const r = (state = 'initial', action) => { seen.push(action.type); return state; };
    expect(createStore(r).getState()).toBe('initial');
    expect(seen).toEqual(['@@store/init']);
    expect(createStore(counter, { preloadedState: { count: 5 } }).getState()).toEqual({ count: 5 });
  });

  it('dispatch runs the reducer and returns the action', () => {
    const store = createStore(counter);
    const action = { type: 'add', payload: 3 };
    expect(store.dispatch(action)).toBe(action);
    store.dispatch({ type: 'inc' });
    expect(store.getState()).toEqual({ count: 4 });
  });

  it('rejects actions that are not plain objects with a string type', () => {
    const store = createStore(counter);
    class Action { constructor() { this.type = 'inc'; } }
    for (const bad of [null, undefined, 'inc', () => {}, [], new Action()]) {
      const e = thrown(() => store.dispatch(bad));
      expect(e).toBeInstanceOf(TypeError);
      expect(e.message).toContain('plain object');
    }
    const e = thrown(() => store.dispatch({ type: 1 }));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toContain('type');
    expect(store.dispatch(Object.assign(Object.create(null), { type: 'inc' })).type).toBe('inc');
  });
});

describe('the reducer is protected', () => {
  it('dispatch, getState and subscribe inside the reducer throw', () => {
    let store;
    const r = (state = 0, action) => {
      if (action.type === 'dispatch') store.dispatch({ type: 'other' });
      if (action.type === 'getState') store.getState();
      if (action.type === 'subscribe') store.subscribe(() => {});
      return state;
    };
    store = createStore(r);
    for (const type of ['dispatch', 'getState', 'subscribe']) {
      const e = thrown(() => store.dispatch({ type }));
      expect(e.message).toContain('reducer');
    }
    expect(() => store.dispatch({ type: 'fine' })).not.toThrow();
  });

  it('a throwing reducer leaves the state alone and the store usable', () => {
    const store = createStore(counter);
    let calls = 0;
    store.subscribe(() => calls++);
    store.dispatch({ type: 'inc' });
    const before = store.getState();
    expect(thrown(() => store.dispatch({ type: 'boom' })).message).toBe('reducer exploded');
    expect(store.getState()).toBe(before);
    expect(calls).toBe(1);
    store.dispatch({ type: 'inc' });
    expect(store.getState()).toEqual({ count: 2 });
    expect(calls).toBe(2);
  });
});

describe('subscribe', () => {
  it('notifies on change only, in order, and unsubscribes', () => {
    const store = createStore(counter);
    const log = [];
    const offA = store.subscribe(() => log.push('a'));
    store.subscribe(() => log.push('b'));
    store.dispatch({ type: 'unknown' });
    expect(log).toEqual([]);
    store.dispatch({ type: 'inc' });
    expect(log).toEqual(['a', 'b']);
    offA();
    offA();
    store.dispatch({ type: 'inc' });
    expect(log).toEqual(['a', 'b', 'b']);
  });

  it('calls listeners with no arguments', () => {
    const store = createStore(counter);
    let args;
    store.subscribe((...a) => { args = a; });
    store.dispatch({ type: 'inc' });
    expect(args).toEqual([]);
  });

  it('a listener unsubscribed earlier in the round is skipped; one added during it waits', () => {
    const store = createStore(counter);
    const log = [];
    let offB;
    store.subscribe(() => {
      log.push('a');
      offB();
      store.subscribe(() => log.push('late'));
    });
    offB = store.subscribe(() => log.push('b'));
    store.dispatch({ type: 'inc' });
    expect(log).toEqual(['a']);
    store.dispatch({ type: 'inc' });
    expect(log).toEqual(['a', 'a', 'late']);
  });

  it('a listener may dispatch', () => {
    const store = createStore(counter);
    store.subscribe(() => {
      if (store.getState().count === 1) store.dispatch({ type: 'add', payload: 10 });
    });
    store.dispatch({ type: 'inc' });
    expect(store.getState()).toEqual({ count: 11 });
  });
});

describe('middleware', () => {
  const tracer = (name, log) => () => (next) => (action) => {
    log.push(`${name} in ${action.type}`);
    const result = next(action);
    log.push(`${name} out ${action.type}`);
    return result;
  };

  it('runs outermost first and unwinds in reverse', () => {
    const log = [];
    const r = (state = 0, action) => { log.push(`reducer ${action.type}`); return state; };
    const store = createStore(r, { middleware: [tracer('A', log), tracer('B', log)] });
    log.length = 0;
    store.dispatch({ type: 'x' });
    expect(log).toEqual(['A in x', 'B in x', 'reducer x', 'B out x', 'A out x']);
  });

  it('api.dispatch goes through the whole chain', () => {
    const log = [];
    const expandBatch = (api) => (next) => (action) => {
      if (action.type !== 'batch') return next(action);
      action.payload.forEach((inner) => api.dispatch(inner));
      return 'batched';
    };
    const store = createStore(counter, { middleware: [tracer('log', log), expandBatch] });
    const result = store.dispatch({ type: 'batch', payload: [{ type: 'inc' }, { type: 'add', payload: 5 }] });
    expect(result).toBe('batched');
    expect(store.getState()).toEqual({ count: 6 });
    expect(log).toEqual(['log in batch', 'log in inc', 'log out inc', 'log in add', 'log out add', 'log out batch']);
  });

  it('can swallow or replace actions, and the chain decides the return value', () => {
    const blockAdd = () => (next) => (action) => (action.type === 'add' ? 'blocked' : next(action));
    const store = createStore(counter, { middleware: [blockAdd] });
    expect(store.dispatch({ type: 'add', payload: 100 })).toBe('blocked');
    expect(store.getState()).toEqual({ count: 0 });
    store.dispatch({ type: 'inc' });
    expect(store.getState()).toEqual({ count: 1 });
  });

  it('gives middleware getState, and forbids dispatch while it is being applied', () => {
    let seenAtSetup;
    const peek = (api) => {
      seenAtSetup = api.getState();
      return (next) => (action) => next(action);
    };
    createStore(counter, { preloadedState: { count: 7 }, middleware: [peek] });
    expect(seenAtSetup).toEqual({ count: 7 });

    const eager = (api) => {
      api.dispatch({ type: 'inc' });
      return (next) => (action) => next(action);
    };
    const e = thrown(() => createStore(counter, { middleware: [eager] }));
    expect(e.message).toContain('middleware');
  });

  it('each middleware is set up once, not on every dispatch', () => {
    let setups = 0;
    let links = 0;
    const counting = () => { setups++; return (next) => { links++; return (action) => next(action); }; };
    const store = createStore(counter, { middleware: [counting] });
    store.dispatch({ type: 'inc' });
    store.dispatch({ type: 'inc' });
    expect([setups, links]).toEqual([1, 1]);
  });
});

describe('thunk', () => {
  it('runs function actions with dispatch and getState, returning their result', async () => {
    const log = [];
    const store = createStore(counter, { middleware: [thunk, () => (next) => (action) => { log.push(action.type); return next(action); }] });
    const result = store.dispatch(async (dispatch, getState) => {
      dispatch({ type: 'inc' });
      await Promise.resolve();
      dispatch({ type: 'add', payload: getState().count * 10 });
      return 'done';
    });
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe('done');
    expect(store.getState()).toEqual({ count: 11 });
    expect(log).toEqual(['inc', 'add']);
  });

  it('thunks can dispatch thunks', () => {
    const store = createStore(counter, { middleware: [thunk] });
    const incTwice = (dispatch) => { dispatch({ type: 'inc' }); dispatch({ type: 'inc' }); return 2; };
    const outer = (dispatch) => dispatch(incTwice) + dispatch(incTwice);
    expect(store.dispatch(outer)).toBe(4);
    expect(store.getState()).toEqual({ count: 4 });
  });

  it('passes plain actions straight through', () => {
    const store = createStore(counter, { middleware: [thunk] });
    const action = { type: 'inc' };
    expect(store.dispatch(action)).toBe(action);
    expect(store.getState()).toEqual({ count: 1 });
  });
});
