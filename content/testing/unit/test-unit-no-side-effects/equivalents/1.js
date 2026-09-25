// Same behaviour: decorate with a sort key and the original index, sort, undecorate.
const PRIORITY = ['high', 'medium', 'low'];

export function prioritise(tasks) {
  return tasks
    .map((task, index) => ({
      task,
      key: [task.done ? 1 : 0, PRIORITY.indexOf(task.priority), task.due === undefined ? 1 : 0, task.due ?? '', index],
    }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] < b.key[i]) return -1;
        if (a.key[i] > b.key[i]) return 1;
      }
      return 0;
    })
    .map(({ task }) => task);
}

export function completeTask(tasks, id) {
  const out = [];
  for (const task of tasks) out.push(task.id === id ? Object.assign({}, task, { done: true }) : task);
  return out;
}
