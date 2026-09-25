import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

// TODO: forward the ref and expose { focus, clear } instead of nothing
export function SearchInput({ label, onValueChange }) {
  const [value, setValue] = useState('');
  return (
    <input
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
