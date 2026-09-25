export function createEntityAdapter({ selectId = (e) => e.id, sortComparer } = {}) {
  const notYet = (name) => () => {
    throw new Error(`${name}: not implemented`);
  };
  return {
    getInitialState: (extra = {}) => ({ ids: [], entities: {}, ...extra }),
    // TODO: every operation is pure, returns `state` itself when nothing
    // changed, and keeps `ids` in insertion order (or sorted by sortComparer).
    addOne: notYet('addOne'),
    addMany: notYet('addMany'),
    upsertOne: notYet('upsertOne'),
    upsertMany: notYet('upsertMany'),
    updateOne: notYet('updateOne'),
    updateMany: notYet('updateMany'),
    removeOne: notYet('removeOne'),
    removeMany: notYet('removeMany'),
    setAll: notYet('setAll'),
    getSelectors: () => ({
      selectIds: notYet('selectIds'),
      selectEntities: notYet('selectEntities'),
      selectAll: notYet('selectAll'),
      selectById: notYet('selectById'),
      selectTotal: notYet('selectTotal'),
    }),
  };
}
