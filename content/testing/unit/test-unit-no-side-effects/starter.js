const task = (id, priority, extra = {}) => ({ id, title: `task ${id}`, priority, done: false, ...extra });

describe('prioritise', () => {
  it('puts high before medium before low', () => {
    const tasks = [task('a', 'low'), task('b', 'high'), task('c', 'medium')];
    expect(solution.prioritise(tasks).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('completeTask', () => {
  it('marks the task done', () => {
    const tasks = [task('a', 'low'), task('b', 'high')];
    const result = solution.completeTask(tasks, 'b');
    expect(result.find((t) => t.id === 'b').done).toBe(true);
  });

  // TODO: what did these calls do to `tasks`?
});
