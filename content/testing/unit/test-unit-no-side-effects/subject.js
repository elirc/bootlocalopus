const RANK = { high: 0, medium: 1, low: 2 };

function compare(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const byPriority = RANK[a.priority] - RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.due !== b.due) {
    if (a.due === undefined) return 1;
    if (b.due === undefined) return -1;
    return a.due < b.due ? -1 : 1; // ISO dates compare correctly as strings
  }
  return 0; // Array.prototype.sort is stable, so ties keep their input order
}

/** A new array in display order. The input array and its tasks are left untouched. */
export function prioritise(tasks) {
  return [...tasks].sort(compare);
}

/** A new array in which task `id` is replaced by a copy marked done. */
export function completeTask(tasks, id) {
  return tasks.map((task) => (task.id === id ? { ...task, done: true } : task));
}
