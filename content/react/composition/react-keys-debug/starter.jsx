import { useState } from 'react';

export function TodoEditor({ todos: initial }) {
  const [todos, setTodos] = useState(initial);

  const remove = (id) => setTodos((current) => current.filter((t) => t.id !== id));

  return (
    <ul>
      {todos.map((todo, index) => (
        // BUG: the index is not this row's identity
        <li key={index}>
          <label htmlFor={'note-' + todo.id}>{todo.title}</label>
          <input id={'note-' + todo.id} defaultValue="" />
          <button onClick={() => remove(todo.id)}>Delete {todo.title}</button>
        </li>
      ))}
    </ul>
  );
}
