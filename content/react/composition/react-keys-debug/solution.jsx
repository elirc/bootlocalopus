import { useState } from 'react';

export function TodoEditor({ todos: initial }) {
  const [todos, setTodos] = useState(initial);

  const remove = (id) => setTodos((current) => current.filter((t) => t.id !== id));

  return (
    <ul>
      {todos.map((todo) => (
        // The id is the row's identity, so React moves the DOM node with it.
        <li key={todo.id}>
          <label htmlFor={'note-' + todo.id}>{todo.title}</label>
          <input id={'note-' + todo.id} defaultValue="" />
          <button onClick={() => remove(todo.id)}>Delete {todo.title}</button>
        </li>
      ))}
    </ul>
  );
}
