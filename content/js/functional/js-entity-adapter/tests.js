const { createEntityAdapter } = solution;

const ada = { id: 1, name: 'Ada', team: 'core' };
const grace = { id: 2, name: 'Grace', team: 'infra' };
const alan = { id: 3, name: 'Alan', team: 'core' };

const byName = (a, b) => a.name.localeCompare(b.name);
const snapshot = (s) => JSON.stringify(s);

describe('basics', () => {
  it('getInitialState keeps extra keys', () => {
    const adapter = createEntityAdapter();
    expect(adapter.getInitialState()).toEqual({ ids: [], entities: {} });
    expect(adapter.getInitialState({ status: 'idle' })).toEqual({ ids: [], entities: {}, status: 'idle' });
  });

  it('addOne / addMany add in insertion order, and selectors read them back', () => {
    const adapter = createEntityAdapter();
    const { selectAll, selectById, selectIds, selectTotal, selectEntities } = adapter.getSelectors();
    let s = adapter.getInitialState({ status: 'idle' });
    s = adapter.addOne(s, grace);
    s = adapter.addMany(s, [ada, alan]);
    expect(selectIds(s)).toEqual([2, 1, 3]);
    expect(selectAll(s)).toEqual([grace, ada, alan]);
    expect(selectAll(s)[0]).toBe(grace);
    expect(selectById(s, 1)).toBe(ada);
    expect(selectById(s, 99)).toBeUndefined();
    expect(selectTotal(s)).toBe(3);
    expect(selectEntities(s)[3]).toBe(alan);
    expect(s.status).toBe('idle');
  });

  it('never mutates the state it was given', () => {
    const adapter = createEntityAdapter();
    const s = adapter.addMany(adapter.getInitialState(), [ada, grace]);
    const before = snapshot(s);
    adapter.addOne(s, alan);
    adapter.upsertOne(s, { id: 1, name: 'Ada L.' });
    adapter.updateOne(s, { id: 2, changes: { team: 'core' } });
    adapter.removeOne(s, 1);
    adapter.setAll(s, [alan]);
    expect(snapshot(s)).toBe(before);
  });
});

describe('no change, same object', () => {
  const adapter = createEntityAdapter();
  const base = () => adapter.addMany(adapter.getInitialState(), [ada, grace]);

  it('adding an existing id leaves it alone', () => {
    const s = base();
    expect(adapter.addOne(s, { id: 1, name: 'Impostor' })).toBe(s);
    const t = adapter.addMany(adapter.getInitialState(), [ada, { id: 1, name: 'Dup' }]);
    expect(adapter.getSelectors().selectById(t, 1)).toBe(ada);
    expect(t.ids).toEqual([1]);
  });

  it('removing or updating a missing id', () => {
    const s = base();
    expect(adapter.removeOne(s, 42)).toBe(s);
    expect(adapter.removeMany(s, [42, 43])).toBe(s);
    expect(adapter.updateOne(s, { id: 42, changes: { name: 'x' } })).toBe(s);
  });

  it('a merge that changes no value', () => {
    const s = base();
    expect(adapter.updateOne(s, { id: 1, changes: { name: 'Ada' } })).toBe(s);
    expect(adapter.upsertOne(s, { id: 2, team: 'infra' })).toBe(s);
    expect(adapter.upsertMany(s, [{ id: 1, name: 'Ada' }, { id: 2 }])).toBe(s);
  });
});

describe('sharing', () => {
  const adapter = createEntityAdapter();

  it('an update replaces one entity and keeps ids and the others', () => {
    const s = adapter.addMany(adapter.getInitialState(), [ada, grace, alan]);
    const next = adapter.updateOne(s, { id: 2, changes: { team: 'core' } });
    expect(next).not.toBe(s);
    expect(next.entities[2]).toEqual({ id: 2, name: 'Grace', team: 'core' });
    expect(next.entities[1]).toBe(ada);
    expect(next.entities[3]).toBe(alan);
    expect(next.ids).toBe(s.ids);
    expect(grace.team).toBe('infra');
  });

  it('upsert merges into existing entities and appends new ones', () => {
    const s = adapter.addMany(adapter.getInitialState(), [ada, grace]);
    const next = adapter.upsertMany(s, [{ id: 1, team: 'infra' }, alan]);
    expect(next.ids).toEqual([1, 2, 3]);
    expect(next.entities[1]).toEqual({ id: 1, name: 'Ada', team: 'infra' });
    expect(next.entities[2]).toBe(grace);
  });

  it('remove drops the id and the entity', () => {
    const s = adapter.addMany(adapter.getInitialState(), [ada, grace, alan]);
    const next = adapter.removeMany(s, [2, 99]);
    expect(next.ids).toEqual([1, 3]);
    expect(Object.hasOwn(next.entities, 2)).toBe(false);
    expect(next.entities[1]).toBe(ada);
  });

  it('setAll replaces everything', () => {
    const s = adapter.addMany(adapter.getInitialState({ page: 2 }), [ada, grace]);
    const next = adapter.setAll(s, [alan]);
    expect(next.ids).toEqual([3]);
    expect(next.entities).toEqual({ 3: alan });
    expect(next.page).toBe(2);
  });

  it('an update that changes the id moves the entity in place', () => {
    const s = adapter.addMany(adapter.getInitialState(), [ada, grace, alan]);
    const next = adapter.updateOne(s, { id: 2, changes: { id: 20 } });
    expect(next.ids).toEqual([1, 20, 3]);
    expect(Object.hasOwn(next.entities, 2)).toBe(false);
    expect(next.entities[20]).toEqual({ id: 20, name: 'Grace', team: 'infra' });
  });
});

describe('custom ids', () => {
  it('uses selectId, keeps id types, and treats prototype names as ordinary ids', () => {
    const adapter = createEntityAdapter({ selectId: (e) => e.slug });
    const { selectById, selectAll } = adapter.getSelectors();
    let s = adapter.getInitialState();
    s = adapter.addMany(s, [{ slug: 'constructor', title: 'A' }, { slug: 'toString', title: 'B' }, { slug: 'hello', title: 'C' }]);
    expect(s.ids).toEqual(['constructor', 'toString', 'hello']);
    expect(selectById(s, 'constructor').title).toBe('A');
    expect(selectById(s, 'valueOf')).toBeUndefined();
    expect(selectAll(s).map((e) => e.title)).toEqual(['A', 'B', 'C']);
    s = adapter.removeOne(s, 'toString');
    expect(s.ids).toEqual(['constructor', 'hello']);
    expect(adapter.removeOne(s, 'hasOwnProperty')).toBe(s);
  });

  it('numeric ids stay numbers', () => {
    const adapter = createEntityAdapter();
    const s = adapter.addOne(adapter.getInitialState(), ada);
    expect(typeof s.ids[0]).toBe('number');
  });
});

describe('sorted', () => {
  const adapter = createEntityAdapter({ sortComparer: byName });
  const { selectAll } = adapter.getSelectors();
  const names = (s) => selectAll(s).map((e) => e.name);

  it('keeps ids sorted as entities are added', () => {
    let s = adapter.getInitialState();
    s = adapter.addOne(s, grace);
    s = adapter.addMany(s, [alan, ada]);
    expect(names(s)).toEqual(['Ada', 'Alan', 'Grace']);
  });

  it('re-sorts when a sorted field changes, and keeps ids when it does not', () => {
    const s = adapter.addMany(adapter.getInitialState(), [ada, grace, alan]);
    const renamed = adapter.updateOne(s, { id: 1, changes: { name: 'Zed' } });
    expect(names(renamed)).toEqual(['Alan', 'Grace', 'Zed']);
    const retagged = adapter.updateOne(s, { id: 1, changes: { team: 'ops' } });
    expect(retagged.ids).toBe(s.ids);
  });

  it('is stable: equal entities keep their order and new ones go after', () => {
    const byTeam = createEntityAdapter({ sortComparer: (a, b) => a.team.localeCompare(b.team) });
    let s = byTeam.getInitialState();
    s = byTeam.addMany(s, [alan, grace, ada]); // core, infra, core
    expect(s.ids).toEqual([3, 1, 2]);
    s = byTeam.addOne(s, { id: 4, name: 'Barbara', team: 'core' });
    expect(s.ids).toEqual([3, 1, 4, 2]);
    s = byTeam.updateOne(s, { id: 3, changes: { name: 'Alan T.' } });
    expect(s.ids).toEqual([3, 1, 4, 2]);
  });
});
