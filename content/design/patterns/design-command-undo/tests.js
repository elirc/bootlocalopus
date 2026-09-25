const { createHistory, addTodo, removeTodo, renameTodo, toggleTodo } = solution;

const seed = () => [
  { id: 1, text: 'milk', done: false },
  { id: 2, text: 'eggs', done: false },
  { id: 3, text: 'bread', done: true },
];
const texts = (list) => list.map((t) => t.text);
// A generic command over a counter, independent of the todo factories.
const counter = () => ({ value: 0 });
const inc = (c, by, label = 'Inc') => ({ label, execute() { c.value += by; }, undo() { c.value -= by; } });

describe('history basics', () => {
  it('executes, undoes and redoes', () => {
    const c = counter();
    const h = createHistory();
    expect(h.canUndo()).toBe(false);
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
    h.execute(inc(c, 1));
    h.execute(inc(c, 10));
    expect(c.value).toBe(11);
    expect(h.undo()).toBe(true);
    expect(c.value).toBe(1);
    expect(h.canRedo()).toBe(true);
    expect(h.redo()).toBe(true);
    expect(c.value).toBe(11);
    h.undo(); h.undo();
    expect(c.value).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.undo()).toBe(false);
  });
  it('a new command clears the redo stack', () => {
    const c = counter();
    const h = createHistory();
    h.execute(inc(c, 1));
    h.execute(inc(c, 2));
    h.undo();
    h.execute(inc(c, 100));
    expect(h.canRedo()).toBe(false);
    expect(h.redo()).toBe(false);
    expect(c.value).toBe(101);
  });
  it('reports labels for the menu', () => {
    const c = counter();
    const h = createHistory();
    expect(h.undoLabel()).toBeNull();
    h.execute(inc(c, 1, 'First'));
    h.execute(inc(c, 1, 'Second'));
    expect(h.undoLabel()).toBe('Second');
    expect(h.redoLabel()).toBeNull();
    h.undo();
    expect(h.undoLabel()).toBe('First');
    expect(h.redoLabel()).toBe('Second');
  });
  it('drops the oldest entries beyond the limit', () => {
    const c = counter();
    const h = createHistory({ limit: 3 });
    for (let i = 1; i <= 5; i++) h.execute(inc(c, i));
    expect(c.value).toBe(15);
    let undos = 0;
    while (h.undo()) undos++;
    expect(undos).toBe(3);
    expect(c.value).toBe(3);
  });
  it('a command that throws is not recorded and leaves redo intact', () => {
    const c = counter();
    const h = createHistory();
    h.execute(inc(c, 1));
    h.execute(inc(c, 2));
    h.undo();
    const bad = { label: 'Bad', execute() { throw new Error('nope'); }, undo() { c.value = -999; } };
    expect(() => h.execute(bad)).toThrow('nope');
    expect(h.undoLabel()).toBe('Inc');
    expect(h.canRedo()).toBe(true);
    h.redo();
    expect(c.value).toBe(3);
  });
});

describe('todo commands', () => {
  it('add and toggle round-trip', () => {
    const list = seed();
    const h = createHistory();
    h.execute(addTodo(list, { id: 4, text: 'jam', done: false }));
    h.execute(toggleTodo(list, 1));
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread', 'jam']);
    expect(list[0].done).toBe(true);
    expect(h.undoLabel()).toBe('Toggle');
    h.undo();
    expect(list[0].done).toBe(false);
    expect(h.undoLabel()).toBe('Add');
    h.undo();
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread']);
  });
  it('undoing a delete restores the original position', () => {
    const list = seed();
    const h = createHistory();
    h.execute(removeTodo(list, 2));
    expect(texts(list)).toEqual(['milk', 'bread']);
    expect(h.undoLabel()).toBe('Delete');
    h.undo();
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread']);
    expect(list[1]).toEqual({ id: 2, text: 'eggs', done: false });
  });
  it('removing a missing id throws and is not recorded', () => {
    const list = seed();
    const h = createHistory();
    expect(() => h.execute(removeTodo(list, 99))).toThrow();
    expect(h.canUndo()).toBe(false);
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread']);
  });
  it('delete finds its index when it runs, not when it was created', () => {
    const list = seed();
    const h = createHistory();
    const del = removeTodo(list, 3);
    h.execute(removeTodo(list, 1));
    h.execute(del);
    expect(texts(list)).toEqual(['eggs']);
    h.undo(); h.undo();
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread']);
    h.redo(); h.redo();
    expect(texts(list)).toEqual(['eggs']);
    h.undo();
    expect(texts(list)).toEqual(['eggs', 'bread']);
  });
  it('several deletes undo in reverse order to the right places', () => {
    const list = seed();
    const h = createHistory();
    h.execute(removeTodo(list, 2));
    h.execute(removeTodo(list, 1));
    h.execute(removeTodo(list, 3));
    expect(list).toEqual([]);
    while (h.undo());
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread']);
  });
});

describe('merging renames', () => {
  it('consecutive renames of one todo are one undo step', () => {
    const list = seed();
    const h = createHistory();
    h.execute(renameTodo(list, 1, 'o'));
    h.execute(renameTodo(list, 1, 'oa'));
    h.execute(renameTodo(list, 1, 'oat milk'));
    expect(list[0].text).toBe('oat milk');
    expect(h.undoLabel()).toBe('Rename');
    h.undo();
    expect(list[0].text).toBe('milk');
    expect(h.canUndo()).toBe(false);
    h.redo();
    expect(list[0].text).toBe('oat milk');
    h.undo();
    expect(list[0].text).toBe('milk');
  });
  it('renames of different todos stay separate', () => {
    const list = seed();
    const h = createHistory();
    h.execute(renameTodo(list, 1, 'oat milk'));
    h.execute(renameTodo(list, 2, 'free-range eggs'));
    h.undo();
    expect(texts(list)).toEqual(['oat milk', 'eggs', 'bread']);
    h.undo();
    expect(texts(list)).toEqual(['milk', 'eggs', 'bread']);
  });
  it('another command in between breaks the merge', () => {
    const list = seed();
    const h = createHistory();
    h.execute(renameTodo(list, 1, 'a'));
    h.execute(toggleTodo(list, 2));
    h.execute(renameTodo(list, 1, 'ab'));
    h.undo();
    expect(list[0].text).toBe('a');
  });
  it('never merges into a command reached by undo or redo', () => {
    const list = seed();
    const h = createHistory();
    h.execute(renameTodo(list, 1, 'x'));
    h.execute(renameTodo(list, 2, 'y'));
    h.undo(); // top of undo stack is now the rename of 1
    h.execute(renameTodo(list, 1, 'xz'));
    h.undo();
    expect(list[0].text).toBe('x');
    h.undo();
    expect(list[0].text).toBe('milk');

    const list2 = seed();
    const h2 = createHistory();
    h2.execute(renameTodo(list2, 1, 'p'));
    h2.undo();
    h2.redo();
    h2.execute(renameTodo(list2, 1, 'pq'));
    h2.undo();
    expect(list2[0].text).toBe('p');
  });
  it('a merge still clears the redo stack', () => {
    const c = counter();
    const list = seed();
    const h = createHistory();
    h.execute(inc(c, 1));
    h.undo();
    h.execute(renameTodo(list, 1, 'a'));
    h.execute(renameTodo(list, 1, 'ab'));
    expect(h.canRedo()).toBe(false);
  });
});
