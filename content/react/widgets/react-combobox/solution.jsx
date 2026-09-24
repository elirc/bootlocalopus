import { useState, useEffect, useRef, useId } from 'react';

function announce(count) {
  if (count === null) return '';
  if (count === 0) return 'No results';
  return count === 1 ? '1 result' : `${count} results`;
}

export function Combobox({ label, fetchOptions, onSelect, debounceMs = 250 }) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index) => `${baseId}-option-${index}`;

  const [value, setValue] = useState('');   // what the input shows
  const [term, setTerm] = useState('');     // what we search for; only typing sets it
  const [options, setOptions] = useState([]);
  const [count, setCount] = useState(null); // null: nothing to announce
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Parents pass these inline. As effect dependencies they would restart the
  // debounce (and abort the request) on every parent render.
  const fetchRef = useRef(fetchOptions);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    fetchRef.current = fetchOptions;
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const query = term.trim();
    if (!query) return undefined;

    // `current` is the stale-response guard: once this effect is cleaned up
    // (the user typed again), its response is ignored even if it arrives
    // after the newer one, or if fetchOptions ignores the abort signal.
    let current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchRef.current(query, controller.signal).then(
        (results) => {
          if (!current) return;
          setOptions(results);
          setCount(results.length);
          setActive(-1);
          setOpen(results.length > 0);
        },
        () => {
          // Aborted (expected) or failed: leave the screen as it is. Handling
          // it here also keeps an AbortError from becoming an unhandled rejection.
        },
      );
    }, debounceMs);

    return () => {
      current = false;
      clearTimeout(timer); // a keystroke inside the window cancels the pending call
      controller.abort();  // a newer term cancels the request in flight
    };
  }, [term, debounceMs]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const select = (option) => {
    setValue(option.label);
    // Clearing the term cancels any pending or in-flight search, and
    // selecting does not start a new one: the input changed, the query did not.
    setTerm('');
    close();
    onSelectRef.current?.(option);
  };

  const onChange = (event) => {
    const next = event.target.value;
    setValue(next);
    setTerm(next);
    setActive(-1);
    if (!next.trim()) {
      setOptions([]);
      setCount(null);
      setOpen(false);
    }
  };

  const onKeyDown = (event) => {
    const n = options.length;
    switch (event.key) {
      case 'ArrowDown':
        if (!n) return;
        event.preventDefault(); // keep the caret where it is
        if (!open) {
          setOpen(true);
          setActive(0);
        } else {
          setActive((i) => (i + 1) % n);
        }
        break;
      case 'ArrowUp':
        if (!n) return;
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(n - 1);
        } else {
          setActive((i) => (i <= 0 ? n - 1 : i - 1));
        }
        break;
      case 'Enter':
        if (open && active >= 0) {
          event.preventDefault(); // do not submit a surrounding form
          select(options[active]);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      default:
    }
  };

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listboxId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      {/* Always in the DOM, so aria-controls always resolves; hidden when collapsed. */}
      <ul role="listbox" id={listboxId} aria-label={label} hidden={!open}>
        {options.map((option, index) => (
          <li
            key={option.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === active ? 'true' : 'false'}
            // mousedown would blur the input before the click lands
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select(option)}
          >
            {option.label}
          </li>
        ))}
      </ul>
      <div role="status" aria-live="polite">{announce(count)}</div>
    </div>
  );
}
