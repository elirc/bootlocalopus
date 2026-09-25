const shallowSubset = (changes, target) =>
  Object.keys(changes).every((k) => Object.hasOwn(target, k) && Object.is(changes[k], target[k]));

const sameList = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

export function createEntityAdapter({ selectId = (e) => e.id, sortComparer } = {}) {
  const has = (entities, id) => Object.hasOwn(entities, id);

  /**
   * Run `edit` on working copies of ids/entities. `edit` returns true if it
   * changed anything. Returns the original state when nothing changed, and
   * reuses the original ids array when its contents and order are the same.
   */
  function change(state, edit) {
    const draft = { ids: state.ids.slice(), entities: { ...state.entities } };
    if (!edit(draft)) return state;

    let ids = draft.ids;
    if (sortComparer) {
      // Array#sort is stable, so equal entities keep their order (and new ones,
      // appended at the end, go after existing equals).
      ids = ids.slice().sort((a, b) => sortComparer(draft.entities[a], draft.entities[b]));
    }
    return {
      ...state,
      ids: sameList(ids, state.ids) ? state.ids : ids,
      entities: draft.entities,
    };
  }

  function insert(draft, entity) {
    const id = selectId(entity);
    if (has(draft.entities, id)) return false;
    draft.entities[id] = entity;
    draft.ids.push(id);
    return true;
  }

  function merge(draft, id, changes) {
    if (!has(draft.entities, id)) return false;
    const existing = draft.entities[id];
    if (shallowSubset(changes, existing)) return false;
    const updated = { ...existing, ...changes };
    const newId = selectId(updated);
    if (!Object.is(newId, id)) {
      delete draft.entities[id];
      draft.ids[draft.ids.indexOf(id)] = newId;
    }
    draft.entities[newId] = updated;
    return true;
  }

  function remove(draft, id) {
    if (!has(draft.entities, id)) return false;
    delete draft.entities[id];
    draft.ids.splice(draft.ids.indexOf(id), 1);
    return true;
  }

  // Run a per-item step over a batch; "changed" if any step changed something.
  const batch = (step) => (state, items) =>
    change(state, (draft) => items.reduce((changed, item) => step(draft, item) || changed, false));

  const upsert = (draft, entity) => {
    const id = selectId(entity);
    return has(draft.entities, id) ? merge(draft, id, entity) : insert(draft, entity);
  };
  const update = (draft, { id, changes }) => merge(draft, id, changes);

  const addMany = batch(insert);
  const upsertMany = batch(upsert);
  const updateMany = batch(update);
  const removeMany = batch(remove);

  return {
    getInitialState: (extra = {}) => ({ ids: [], entities: {}, ...extra }),
    addOne: (state, entity) => addMany(state, [entity]),
    addMany,
    upsertOne: (state, entity) => upsertMany(state, [entity]),
    upsertMany,
    updateOne: (state, update) => updateMany(state, [update]),
    updateMany,
    removeOne: (state, id) => removeMany(state, [id]),
    removeMany,
    setAll: (state, entities) =>
      change({ ...state, ids: [], entities: {} }, (draft) => {
        for (const entity of entities) insert(draft, entity);
        return true;
      }),
    getSelectors: () => ({
      selectIds: (state) => state.ids,
      selectEntities: (state) => state.entities,
      selectAll: (state) => state.ids.map((id) => state.entities[id]),
      selectById: (state, id) => (has(state.entities, id) ? state.entities[id] : undefined),
      selectTotal: (state) => state.ids.length,
    }),
  };
}
