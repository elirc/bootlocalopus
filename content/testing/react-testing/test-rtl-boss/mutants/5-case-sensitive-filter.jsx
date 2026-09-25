import { useId, useState } from 'react';

/**
 * An ARIA 1.2 combobox with a listbox popup. DOM focus stays in the input;
 * the highlighted option is announced through aria-activedescendant.
 * options: [{ id, label }]
 */
export function Combobox({ label, options, onSelect }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // index into `matches`, -1 = none
  const base = useId();

  const needle = text.trim();
  const matches = options.filter((o) => o.label.includes(needle));
  const showList = open && matches.length > 0;
  const optionId = (index) => `${base}-option-${index}`;

  const choose = (option) => {
    setText(option.label);
    setOpen(false);
    setActive(-1);
    onSelect(option);
  };

  const onKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!matches.length) return;
        setOpen(true);
        setActive((i) => (i + 1) % matches.length);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!matches.length) return;
        setOpen(true);
        setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
        return;
      case 'Enter':
        if (showList && active >= 0) {
          event.preventDefault();
          choose(matches[active]);
        }
        return;
      case 'Escape':
        // First Escape closes the list; a second one clears the text.
        if (showList) {
          setOpen(false);
          setActive(-1);
        } else {
          setText('');
        }
        return;
      default:
    }
  };

  return (
    <div>
      <label htmlFor={`${base}-input`}>{label}</label>
      <input
        id={`${base}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={`${base}-listbox`}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1); // the list changed, so the old highlight means nothing
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={`${base}-listbox`} role="listbox" aria-label={label}>
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the input
              onClick={() => choose(o)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
      {open && needle && matches.length === 0 && <p role="status">No results</p>}
    </div>
  );
}
