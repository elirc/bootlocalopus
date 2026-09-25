import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';

// ---------- pure board updates (structural sharing throughout) ----------

function removeFromColumn(board, columnId, cardId) {
  const column = board.columns[columnId];
  return {
    ...board,
    columns: { ...board.columns, [columnId]: { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) } },
  };
}

function findColumnId(board, cardId) {
  return board.columnOrder.find((id) => board.columns[id].cardIds.includes(cardId));
}

function addCard(board, { columnId, id, title }) {
  const column = board.columns[columnId];
  if (!column) return board;
  return {
    ...board,
    cards: { ...board.cards, [id]: { id, title } },
    columns: { ...board.columns, [columnId]: { ...column, cardIds: [...column.cardIds, id] } },
  };
}

function moveCard(board, { cardId, toColumnId, toIndex }) {
  const fromColumnId = findColumnId(board, cardId);
  const target = board.columns[toColumnId];
  if (fromColumnId === undefined || !target) return board;

  const from = board.columns[fromColumnId].cardIds;
  const base = fromColumnId === toColumnId ? from.filter((id) => id !== cardId) : target.cardIds;
  const index = Math.max(0, Math.min(toIndex, base.length));
  if (fromColumnId === toColumnId && from.indexOf(cardId) === index) return board; // no-op

  const removed = removeFromColumn(board, fromColumnId, cardId);
  const dest = removed.columns[toColumnId].cardIds;
  const inserted = [...dest.slice(0, index), cardId, ...dest.slice(index)];
  return {
    ...removed,
    columns: { ...removed.columns, [toColumnId]: { ...removed.columns[toColumnId], cardIds: inserted } },
  };
}

function renameCard(board, { cardId, title }) {
  const card = board.cards[cardId];
  const clean = title.trim();
  if (!card || clean === '' || clean === card.title) return board;
  return { ...board, cards: { ...board.cards, [cardId]: { ...card, title: clean } } };
}

function deleteCard(board, { cardId }) {
  const columnId = findColumnId(board, cardId);
  if (columnId === undefined) return board;
  const next = removeFromColumn(board, columnId, cardId);
  const { [cardId]: _gone, ...cards } = next.cards;
  return { ...next, cards };
}

const edits = { addCard, moveCard, renameCard, deleteCard };
const HISTORY_LIMIT = 50;

function historyReducer(state, action) {
  const { past, present, future } = state;
  if (action.type === 'undo') {
    if (past.length === 0) return state;
    return { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] };
  }
  if (action.type === 'redo') {
    if (future.length === 0) return state;
    return { past: [...past, present], present: future[0], future: future.slice(1) };
  }
  const edit = edits[action.type];
  if (!edit) return state;
  const next = edit(present, action);
  if (next === present) return state; // no-ops leave no history entry
  return { past: [...past, present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

// ---------- the store: state outside React, subscribed per slice ----------

function createBoardStore(initialBoard) {
  let state = { past: [], present: initialBoard, future: [] };
  const listeners = new Set();
  let counter = 0;

  const dispatch = (action) => {
    const next = historyReducer(state, action);
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const newId = () => {
    let id;
    do id = `c${++counter}`;
    while (Object.hasOwn(state.present.cards, id));
    return id;
  };

  const actions = {
    addCard(columnId, title) {
      const clean = title.trim();
      if (!state.present.columns[columnId] || clean === '') return undefined;
      const id = newId();
      dispatch({ type: 'addCard', columnId, id, title: clean });
      return id;
    },
    moveCard: (cardId, toColumnId, toIndex) => dispatch({ type: 'moveCard', cardId, toColumnId, toIndex }),
    renameCard: (cardId, title) => dispatch({ type: 'renameCard', cardId, title }),
    deleteCard: (cardId) => dispatch({ type: 'deleteCard', cardId }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
  };
}

const StoreContext = createContext(null);

export function BoardProvider({ initialBoard, children }) {
  // One store for the provider's lifetime. The context value never changes,
  // so the context itself never re-renders anyone.
  const [store] = useState(() => createBoardStore(initialBoard));
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStoreContext(hookName) {
  const store = useContext(StoreContext);
  if (store === null) throw new Error(`${hookName} must be used within a BoardProvider`);
  return store;
}

function useSelection(store, select, isEqual) {
  const memo = useRef(null);
  const getSnapshot = () => {
    const state = store.getState();
    const cached = memo.current;
    if (cached && cached.state === state && cached.select === select) return cached.value;
    const value = select(state);
    if (cached && isEqual(cached.value, value)) {
      memo.current = { state, select, value: cached.value };
      return cached.value;
    }
    memo.current = { state, select, value };
    return value;
  };
  const subscribe = useCallback((cb) => store.subscribe(cb), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useBoard(selector, isEqual = Object.is) {
  const store = useStoreContext('useBoard');
  return useSelection(store, (s) => selector(s.present), isEqual);
}

export function useBoardActions() {
  return useStoreContext('useBoardActions').actions;
}

const historyFlags = (s) => ({ canUndo: s.past.length > 0, canRedo: s.future.length > 0 });
const sameFlags = (a, b) => a.canUndo === b.canUndo && a.canRedo === b.canRedo;

export function useBoardHistory() {
  const store = useStoreContext('useBoardHistory');
  return useSelection(store, historyFlags, sameFlags);
}
