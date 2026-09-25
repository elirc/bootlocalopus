const { BoardProvider, useBoard, useBoardActions, useBoardHistory } = solution;

const makeBoard = () => ({
  columnOrder: ['todo', 'doing', 'done'],
  columns: {
    todo: { id: 'todo', title: 'To do', cardIds: ['a', 'b', 'c'] },
    doing: { id: 'doing', title: 'Doing', cardIds: ['d'] },
    done: { id: 'done', title: 'Done', cardIds: [] },
  },
  cards: {
    a: { id: 'a', title: 'Write spec' },
    b: { id: 'b', title: 'Review PR' },
    c: { id: 'c', title: 'Fix flaky test' },
    d: { id: 'd', title: 'Deploy' },
  },
});

// Renders a probe inside a provider and hands back live accessors.
function setup(board = makeBoard()) {
  const out = { renders: { todo: 0, doing: 0, done: 0, cardA: 0, toolbar: 0, history: 0 } };
  function Probe() {
    out.board = useBoard((b) => b);
    out.actions = useBoardActions();
    return null;
  }
  function Column({ id }) {
    out.renders[id]++;
    const column = useBoard((b) => b.columns[id]);
    return <ul aria-label={column.title}>{column.cardIds.map((cid) => <li key={cid}>{cid}</li>)}</ul>;
  }
  function CardA() {
    out.renders.cardA++;
    const card = useBoard((b) => b.cards.a);
    return <p>card a: {card ? card.title : 'gone'}</p>;
  }
  function Toolbar() {
    out.renders.toolbar++;
    useBoardActions();
    return null;
  }
  function History() {
    out.renders.history++;
    out.history = useBoardHistory();
    return null;
  }
  render(
    <BoardProvider initialBoard={board}>
      <Probe />
      <Column id="todo" />
      <Column id="doing" />
      <Column id="done" />
      <CardA />
      <Toolbar />
      <History />
    </BoardProvider>,
  );
  const ids = (col) => out.board.columns[col].cardIds;
  const run = (fn) => { let r; act(() => { r = fn(out.actions); }); return r; };
  return { out, ids, run, before: out.board };
}

describe('board updates', () => {
  it('moves a card between columns, clamping the index', () => {
    const { ids, run } = setup();
    run((a) => a.moveCard('b', 'doing', 0));
    expect(ids('todo')).toEqual(['a', 'c']);
    expect(ids('doing')).toEqual(['b', 'd']);
    run((a) => a.moveCard('a', 'done', 99));
    run((a) => a.moveCard('c', 'done', -5));
    expect(ids('done')).toEqual(['c', 'a']);
    expect(ids('todo')).toEqual([]);
  });

  it('moves within a column using the index without the card', () => {
    const { ids, run } = setup();
    run((a) => a.moveCard('a', 'todo', 1));
    expect(ids('todo')).toEqual(['b', 'a', 'c']);
    run((a) => a.moveCard('a', 'todo', 2));
    expect(ids('todo')).toEqual(['b', 'c', 'a']);
    run((a) => a.moveCard('a', 'todo', 0));
    expect(ids('todo')).toEqual(['a', 'b', 'c']);
  });

  it('adds cards with fresh ids, trimmed titles, at the end', () => {
    const { out, ids, run } = setup({ ...makeBoard(), cards: { ...makeBoard().cards, c1: { id: 'c1', title: 'taken' } } });
    const id = run((a) => a.addCard('doing', '  Write docs '));
    expect(id).toBe('c2');
    expect(ids('doing')).toEqual(['d', 'c2']);
    expect(out.board.cards.c2).toEqual({ id: 'c2', title: 'Write docs' });
    expect(run((a) => a.addCard('doing', 'Another'))).toBe('c3');
  });

  it('ignores a blank title or an unknown column when adding', () => {
    const { out, run, before } = setup();
    expect(run((a) => a.addCard('doing', '   '))).toBeUndefined();
    expect(run((a) => a.addCard('nope', 'x'))).toBeUndefined();
    expect(out.board).toBe(before);
    expect(out.history).toEqual({ canUndo: false, canRedo: false });
  });

  it('renames with trimming, ignoring blank and unchanged titles', () => {
    const { out, run } = setup();
    run((a) => a.renameCard('a', '  Write the spec '));
    expect(out.board.cards.a).toEqual({ id: 'a', title: 'Write the spec' });
    const after = out.board;
    run((a) => a.renameCard('a', 'Write the spec'));
    run((a) => a.renameCard('a', '  '));
    run((a) => a.renameCard('zzz', 'x'));
    expect(out.board).toBe(after);
  });

  it('deletes a card from its column and from cards', () => {
    const { out, ids, run } = setup();
    run((a) => a.deleteCard('b'));
    expect(ids('todo')).toEqual(['a', 'c']);
    expect('b' in out.board.cards).toBe(false);
  });

  it('never mutates, and shares everything off the changed path', () => {
    const board = makeBoard();
    const snapshot = JSON.parse(JSON.stringify(board));
    const { out, run, before } = setup(board);
    run((a) => a.moveCard('a', 'todo', 2));
    expect(board).toEqual(snapshot);
    expect(out.board).not.toBe(before);
    expect(out.board.columns.todo).not.toBe(before.columns.todo);
    expect(out.board.columns.doing).toBe(before.columns.doing);
    expect(out.board.columns.done).toBe(before.columns.done);
    expect(out.board.cards).toBe(before.cards);
    run((a) => a.renameCard('b', 'Review the PR'));
    expect(out.board.cards.a).toBe(before.cards.a);
    expect(out.board.columns.todo.cardIds).toEqual(['b', 'c', 'a']);
  });

  it('treats a move to the same place as no change at all', () => {
    const { out, run, before } = setup();
    run((a) => a.moveCard('b', 'todo', 1));
    run((a) => a.moveCard('nope', 'todo', 0));
    run((a) => a.moveCard('a', 'nope', 0));
    expect(out.board).toBe(before);
  });
});

describe('undo and redo', () => {
  it('undoes and redoes each change', () => {
    const { out, ids, run, before } = setup();
    run((a) => a.moveCard('a', 'done', 0));
    run((a) => a.renameCard('d', 'Ship it'));
    expect(out.history).toEqual({ canUndo: true, canRedo: false });
    run((a) => a.undo());
    expect(out.board.cards.d.title).toBe('Deploy');
    expect(ids('done')).toEqual(['a']);
    run((a) => a.undo());
    expect(out.board).toBe(before);
    expect(out.history).toEqual({ canUndo: false, canRedo: true });
    run((a) => a.redo());
    run((a) => a.redo());
    expect(out.board.cards.d.title).toBe('Ship it');
    expect(out.history).toEqual({ canUndo: true, canRedo: false });
  });

  it('records no entry for no-ops, and clears redo on a new change', () => {
    const { out, run } = setup();
    run((a) => a.moveCard('a', 'doing', 0));
    run((a) => a.moveCard('a', 'doing', 0));
    run((a) => a.renameCard('a', 'Write spec'));
    run((a) => a.undo());
    expect(out.history.canUndo).toBe(false);
    run((a) => a.deleteCard('c'));
    expect(out.history.canRedo).toBe(false);
    run((a) => a.redo());
    expect(out.board.columns.doing.cardIds).toEqual(['d']);
  });

  it('keeps at most 50 entries', () => {
    const { out, run } = setup();
    for (let i = 0; i < 60; i++) run((a) => a.renameCard('a', 'title ' + i));
    for (let i = 0; i < 100; i++) run((a) => a.undo());
    expect(out.board.cards.a.title).toBe('title 9');
  });
});

describe('render cost', () => {
  it('re-renders only the columns whose object changed', () => {
    const { out, run } = setup();
    const r = out.renders;
    const start = { ...r };
    run((a) => a.moveCard('a', 'todo', 2));
    expect(r.todo).toBe(start.todo + 1);
    expect(r.doing).toBe(start.doing);
    expect(r.done).toBe(start.done);
    run((a) => a.moveCard('d', 'done', 0));
    expect(r.todo).toBe(start.todo + 1);
    expect(r.doing).toBe(start.doing + 1);
    expect(r.done).toBe(start.done + 1);
  });

  it('re-renders a card only when that card changes', () => {
    const { out, run } = setup();
    const r = out.renders;
    const start = r.cardA;
    run((a) => a.moveCard('a', 'doing', 0));
    run((a) => a.renameCard('b', 'Review it'));
    expect(r.cardA).toBe(start);
    run((a) => a.renameCard('a', 'Write it'));
    expect(r.cardA).toBe(start + 1);
    expect(screen.getByText('card a: Write it')).toBeTruthy();
  });

  it('never re-renders an actions-only component, and gives it one stable object', () => {
    const { out, run } = setup();
    const first = out.actions;
    run((a) => a.addCard('todo', 'x'));
    run((a) => a.moveCard('a', 'done', 0));
    run((a) => a.undo());
    expect(out.renders.toolbar).toBe(1);
    expect(out.actions).toBe(first);
  });

  it('re-renders the history reader only when a flag flips', () => {
    const { out, run } = setup();
    const r = out.renders;
    const start = r.history;
    run((a) => a.renameCard('a', 'one'));
    expect(r.history).toBe(start + 1);
    run((a) => a.renameCard('a', 'two'));
    run((a) => a.renameCard('a', 'three'));
    expect(r.history).toBe(start + 1);
  });

  it('shows the moved card in the right lists', () => {
    const { run } = setup();
    run((a) => a.moveCard('c', 'doing', 1));
    const items = (name) => within(screen.getByRole('list', { name })).queryAllByRole('listitem').map((li) => li.textContent);
    expect(items('To do')).toEqual(['a', 'b']);
    expect(items('Doing')).toEqual(['d', 'c']);
  });
});

describe('outside a provider', () => {
  it('throws a helpful error from each hook', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useBoard((b) => b))).toThrow('useBoard must be used within a BoardProvider');
      expect(() => renderHook(() => useBoardActions())).toThrow('useBoardActions must be used within a BoardProvider');
      expect(() => renderHook(() => useBoardHistory())).toThrow('useBoardHistory must be used within a BoardProvider');
    } finally {
      console.error = original;
    }
  });
});
