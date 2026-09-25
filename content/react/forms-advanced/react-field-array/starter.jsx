import { useEffect, useRef, useState } from 'react';

export function GuestList({ onSubmit }) {
  const [guests, setGuests] = useState([{ name: '', email: '' }]);

  const update = (index, field, value) => {
    setGuests(guests.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };

  // TODO: stable row ids as keys, focus after add/remove, and a clean
  // submitted shape.
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(guests); }}>
      {guests.map((guest, index) => (
        <div key={index}>
          <label>
            Guest {index + 1} name
            <input value={guest.name} onChange={(e) => update(index, 'name', e.target.value)} />
          </label>
          <label>
            Guest {index + 1} email
            <input value={guest.email} onChange={(e) => update(index, 'email', e.target.value)} />
          </label>
          <button onClick={() => setGuests(guests.filter((_, i) => i !== index))}>
            Remove guest {index + 1}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setGuests([...guests, { name: '', email: '' }])}>
        Add guest
      </button>
      <button type="submit">Save</button>
    </form>
  );
}
