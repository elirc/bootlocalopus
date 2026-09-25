import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

export const SearchInput = forwardRef(function SearchInput({ label, onValueChange }, ref) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const update = (next) => {
    setValue(next);
    onValueChange?.(next);
  };

  // The dependency list is omitted on purpose: the handle is rebuilt after
  // every render, so clear() always closes over the latest onValueChange.
  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current.focus();
    },
    clear() {
      update('');
      inputRef.current.focus();
    },
  }));

  return (
    <input
      ref={inputRef}
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => update(e.target.value)}
    />
  );
});
