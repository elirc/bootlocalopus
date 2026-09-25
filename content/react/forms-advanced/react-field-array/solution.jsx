import { useEffect, useRef, useState } from 'react';

export function GuestList({ onSubmit }) {
  const nextId = useRef(1);
  const newRow = () => ({ id: nextId.current++, name: '', email: '' });
  const [rows, setRows] = useState(() => [newRow()]);

  // Name inputs by row id, and what to focus after the next render (a row
  // id, or 'add' for the Add button). The element to focus may not exist yet
  // when the click handler runs, so focusing waits for the effect.
  const nameInputs = useRef(new Map());
  const addButton = useRef(null);
  const focusNext = useRef(null);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    if (target === 'add') addButton.current?.focus();
    else nameInputs.current.get(target)?.focus();
  }, [rows]);

  const update = (id, field, value) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const add = () => {
    const row = newRow();
    focusNext.current = row.id;
    setRows((current) => [...current, row]);
  };

  const remove = (index) => {
    const remaining = rows.filter((_, i) => i !== index);
    // The row that slides into this position, else the new last row.
    const heir = remaining[index] ?? remaining[remaining.length - 1];
    focusNext.current = heir ? heir.id : 'add';
    setRows(remaining);
  };

  const submit = (event) => {
    event.preventDefault();
    const guests = rows
      .map((row) => ({ name: row.name.trim(), email: row.email.trim() }))
      .filter((guest) => guest.name !== '' || guest.email !== '');
    onSubmit(guests);
  };

  return (
    <form onSubmit={submit}>
      {rows.map((row, index) => (
        // A stable key: removing a row never hands its DOM nodes to another.
        <div key={row.id}>
          <label>
            Guest {index + 1} name
            <input
              ref={(el) => {
                if (el) nameInputs.current.set(row.id, el);
                else nameInputs.current.delete(row.id);
              }}
              value={row.name}
              onChange={(e) => update(row.id, 'name', e.target.value)}
            />
          </label>
          <label>
            Guest {index + 1} email
            <input type="email" value={row.email} onChange={(e) => update(row.id, 'email', e.target.value)} />
          </label>
          <button type="button" onClick={() => remove(index)}>
            Remove guest {index + 1}
          </button>
        </div>
      ))}
      <button type="button" ref={addButton} onClick={add}>
        Add guest
      </button>
      <button type="submit">Save</button>
    </form>
  );
}
