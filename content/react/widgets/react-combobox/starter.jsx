import { useState, useEffect, useRef, useId } from 'react';

export function Combobox({ label, fetchOptions, onSelect, debounceMs = 250 }) {
  const id = useId();
  const [value, setValue] = useState('');

  // TODO: debounced, abortable search; a listbox of options; arrow keys,
  // Enter and Escape; aria-expanded / aria-controls / aria-activedescendant;
  // a live region announcing the result count.
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} role="combobox" value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}
