const task = (id, priority, extra = {}) => ({ id, title: `task ${id}`, priority, done: false, ...extra });
const ids = (tasks) => tasks.map((t) => t.id);

/** Freezes the array and every task in it: in strict mode any write now throws. */
const frozen = (tasks) => Object.freeze(tasks.map((t) => Object.freeze({ ...t })));

describe('prioritise: order', () => {
  it('ranks high, medium, low', () => {
    const tasks = [task('a', 'low'), task('b', 'high'), task('c', 'medium')];
    expect(ids(solution.prioritise(tasks))).toEqual(['b', 'c', 'a']);
  });

  it('puts done tasks last, whatever their priority', () => {
    const tasks = [task('done-high', 'high', { done: true }), task('open-low', 'low')];
    expect(ids(solution.prioritise(tasks))).toEqual(['open-low', 'done-high']);
  });

  it('orders by due date within a priority, undated last', () => {
    const tasks = [
      task('undated', 'high'),
      task('may', 'high', { due: '2024-05-01' }),
      task('april', 'high', { due: '2024-04-15' }),
    ];
    expect(ids(solution.prioritise(tasks))).toEqual(['april', 'may', 'undated']);
  });

  it('keeps the input order for ties (no alphabetical tiebreak)', () => {
    const tasks = [
      task('1', 'medium', { title: 'Zebra', due: '2024-05-01' }),
      task('2', 'medium', { title: 'Apple', due: '2024-05-01' }),
      task('3', 'medium', { title: 'Mango', due: '2024-05-01' }),
    ];
    expect(ids(solution.prioritise(tasks))).toEqual(['1', '2', '3']);
  });
});

describe('prioritise: no side effects', () => {
  it('works on a deep-frozen input (so it writes to nothing)', () => {
    const tasks = frozen([task('a', 'low'), task('b', 'high')]);
    expect(ids(solution.prioritise(tasks))).toEqual(['b', 'a']);
  });

  it('returns a new array and leaves the input exactly as it was', () => {
    const tasks = [task('a', 'low'), task('b', 'high', { due: '2024-01-01' }), task('c', 'medium')];
    const before = structuredClone(tasks);
    const result = solution.prioritise(tasks);
    expect(result).not.toBe(tasks);
    expect(tasks).toEqual(before);
  });
});

describe('completeTask', () => {
  it('returns a copy of the task marked done, others unchanged', () => {
    const tasks = [task('a', 'low'), task('b', 'high')];
    const result = solution.completeTask(tasks, 'b');
    expect(result).toEqual([task('a', 'low'), task('b', 'high', { done: true })]);
  });

  it('does not touch the input', () => {
    const tasks = frozen([task('a', 'low'), task('b', 'high')]);
    const result = solution.completeTask(tasks, 'a');
    expect(result[0].done).toBe(true);
    expect(tasks[0].done).toBe(false);
  });

  it('changes nothing for an unknown id', () => {
    const tasks = [task('a', 'low')];
    expect(solution.completeTask(tasks, 'nope')).toEqual([task('a', 'low')]);
  });
});
