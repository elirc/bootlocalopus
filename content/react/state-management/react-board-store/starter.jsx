import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';

// The version that stutters: the whole board in one context value.
const BoardContext = createContext(null);

export function BoardProvider({ initialBoard, children }) {
  const [board, setBoard] = useState(initialBoard);

  const actions = {
    moveCard(cardId, toColumnId, toIndex) {
      // Mutates in place, then "updates" with a shallow copy.
      for (const id of board.columnOrder) {
        const list = board.columns[id].cardIds;
        const at = list.indexOf(cardId);
        if (at !== -1) list.splice(at, 1);
      }
      board.columns[toColumnId].cardIds.splice(toIndex, 0, cardId);
      setBoard({ ...board });
    },
    addCard() { throw new Error('addCard is not implemented yet'); },
    renameCard() { throw new Error('renameCard is not implemented yet'); },
    deleteCard() { throw new Error('deleteCard is not implemented yet'); },
    undo() { throw new Error('undo is not implemented yet'); },
    redo() { throw new Error('redo is not implemented yet'); },
  };

  return <BoardContext.Provider value={{ board, actions }}>{children}</BoardContext.Provider>;
}

export function useBoard(selector, isEqual = Object.is) {
  return selector(useContext(BoardContext).board);
}

export function useBoardActions() {
  return useContext(BoardContext).actions;
}

export function useBoardHistory() {
  // TODO
  return { canUndo: false, canRedo: false };
}
