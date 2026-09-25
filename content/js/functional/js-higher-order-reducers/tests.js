const { withReset, filterActions, requestStatus, keyedBy } = solution;

const INIT = { type: '@@init' };
const counter = (state = 0, action) => {
  switch (action.type) {
    case 'inc': return state + 1;
    case 'add': return state + action.payload;
    default: return state;
  }
};
const list = (state = [], action) => (action.type === 'push' ? [...state, action.payload] : state);

const pending = (id, extra = {}) => ({ type: 'search/pending', meta: { requestId: id, ...extra } });
const fulfilled = (id, extra = {}) => ({ type: 'search/fulfilled', meta: { requestId: id, ...extra } });
const rejected = (id, message, extra = {}) => ({ type: 'search/rejected', meta: { requestId: id, ...extra }, error: { message } });

describe('withReset', () => {
  it('returns the initial state on the reset action and delegates otherwise', () => {
    const r = withReset(list, 'logout');
    let s = r(undefined, INIT);
    s = r(s, { type: 'push', payload: 1 });
    s = r(s, { type: 'push', payload: 2 });
    expect(s).toEqual([1, 2]);
    expect(r(s, { type: 'logout' })).toEqual([]);
    expect(r(s, { type: 'other' })).toBe(s);
  });

  it('passes the reset action to the wrapped reducer with undefined state', () => {
    const calls = [];
    const r = withReset((state = 'init', action) => { calls.push([state, action.type]); return state; }, 'reset');
    r('dirty', { type: 'reset' });
    expect(calls).toEqual([['init', 'reset']]);
  });
});

describe('filterActions', () => {
  it('ignores actions the predicate rejects, returning the same state', () => {
    const r = filterActions(counter, (a) => a.type.startsWith('local/') || a.type === 'inc');
    expect(r(5, { type: 'add', payload: 10 })).toBe(5);
    expect(r(5, { type: 'inc' })).toBe(6);
  });

  it('still initialises when the state is undefined', () => {
    const r = filterActions(list, () => false);
    expect(r(undefined, INIT)).toEqual([]);
    const s = [1];
    expect(r(s, { type: 'push', payload: 2 })).toBe(s);
  });
});

describe('requestStatus', () => {
  const search = requestStatus('search');

  it('starts idle and ignores other actions', () => {
    const s = search(undefined, INIT);
    expect(s).toEqual({ status: 'idle', error: null, requestId: null });
    expect(search(s, { type: 'other/pending', meta: { requestId: 'x' } })).toBe(s);
  });

  it('goes loading then succeeded', () => {
    let s = search(undefined, INIT);
    s = search(s, pending('r1'));
    expect(s).toEqual({ status: 'loading', error: null, requestId: 'r1' });
    s = search(s, fulfilled('r1'));
    expect(s).toEqual({ status: 'succeeded', error: null, requestId: null });
  });

  it('goes loading then failed with the error message', () => {
    let s = search(undefined, INIT);
    s = search(s, pending('r1'));
    s = search(s, rejected('r1', 'Network down'));
    expect(s).toEqual({ status: 'failed', error: 'Network down', requestId: null });
    s = search(s, pending('r2'));
    expect(s).toEqual({ status: 'loading', error: null, requestId: 'r2' });
  });

  it('ignores a stale response from an older request', () => {
    let s = search(undefined, INIT);
    s = search(s, pending('r1'));
    s = search(s, pending('r2'));
    const loading = s;
    expect(search(loading, fulfilled('r1'))).toBe(loading);
    expect(search(loading, rejected('r1', 'late failure'))).toBe(loading);
    s = search(loading, fulfilled('r2'));
    expect(s.status).toBe('succeeded');
  });

  it('ignores a duplicate or unexpected response once settled', () => {
    let s = search(undefined, INIT);
    expect(search(s, fulfilled('r9'))).toBe(s);
    s = search(s, pending('r1'));
    s = search(s, fulfilled('r1'));
    expect(search(s, fulfilled('r1'))).toBe(s);
    expect(search(s, rejected('r1', 'dup'))).toBe(s);
    expect(search(s, fulfilled(undefined))).toBe(s);
  });
});

describe('keyedBy', () => {
  const byId = keyedBy(counter, (a) => a.meta?.id);

  it('keeps one slice per key, starting from the initial state', () => {
    let s = byId(undefined, INIT);
    expect(s).toEqual({});
    s = byId(s, { type: 'inc', meta: { id: 'a' } });
    s = byId(s, { type: 'inc', meta: { id: 'a' } });
    s = byId(s, { type: 'add', payload: 5, meta: { id: 'b' } });
    expect(s).toEqual({ a: 2, b: 5 });
  });

  it('returns the same state when there is no key or the slice did not change', () => {
    const s = { a: 1 };
    expect(byId(s, { type: 'inc' })).toBe(s);
    expect(byId(s, { type: 'inc', meta: { id: null } })).toBe(s);
    expect(byId(s, { type: 'noop', meta: { id: 'a' } })).toBe(s);
  });

  it('replaces only the key that changed', () => {
    const lists = keyedBy(list, (a) => a.meta?.id);
    const s = { a: [1], b: [2] };
    const next = lists(s, { type: 'push', payload: 3, meta: { id: 'a' } });
    expect(next).toEqual({ a: [1, 3], b: [2] });
    expect(next.b).toBe(s.b);
    expect(s.a).toEqual([1]);
  });

  it('a noop for a brand-new key still creates its slice', () => {
    const s = {};
    const next = byId(s, { type: 'noop', meta: { id: 'fresh' } });
    expect(next).toEqual({ fresh: 0 });
  });

  it('only reads own keys', () => {
    let s = byId(undefined, INIT);
    s = byId(s, { type: 'inc', meta: { id: 'constructor' } });
    s = byId(s, { type: 'inc', meta: { id: 'toString' } });
    expect(s.constructor).toBe(1);
    expect(Object.keys(s).sort()).toEqual(['constructor', 'toString']);
  });

  it('composes with requestStatus for a loading state per user', () => {
    const users = keyedBy(requestStatus('user/fetch'), (a) => a.meta?.userId);
    let s = users(undefined, INIT);
    s = users(s, { type: 'user/fetch/pending', meta: { requestId: 'q1', userId: 7 } });
    s = users(s, { type: 'user/fetch/pending', meta: { requestId: 'q2', userId: 9 } });
    s = users(s, { type: 'user/fetch/fulfilled', meta: { requestId: 'q1', userId: 7 } });
    expect(s[7].status).toBe('succeeded');
    expect(s[9].status).toBe('loading');
    const before = s;
    expect(users(before, { type: 'user/fetch/fulfilled', meta: { requestId: 'q1', userId: 9 } })).toBe(before);
  });
});
