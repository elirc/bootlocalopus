import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export function MenuButton({ label, items, onSelect }) {
  // null while closed; otherwise the index of the focused item.
  const [active, setActive] = useState(null);
  const open = active !== null;

  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const id = useId();
  const buttonId = `${id}-button`;
  const menuId = `${id}-menu`;

  // Focus follows `active`. A layout effect runs before the browser paints,
  // so there is no frame with the menu open and focus still on the button.
  useLayoutEffect(() => {
    if (active !== null) itemRefs.current[active]?.focus();
  }, [active]);

  const close = ({ refocus }) => {
    setActive(null);
    if (refocus) buttonRef.current?.focus();
  };

  // Close on a mousedown outside. The button counts as inside: its own click
  // handler toggles the menu, and closing here first would reopen it.
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setActive(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const select = (index) => {
    const item = items[index];
    if (item.disabled) return;
    onSelect(item.id);
    close({ refocus: true });
  };

  const onButtonKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(items.length - 1);
    }
  };

  const onMenuKeyDown = (event) => {
    const last = items.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(active === last ? 0 : active + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive(active === 0 ? last : active - 1);
        return;
      case 'Home':
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        event.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        select(active);
        return;
      case 'Escape':
        close({ refocus: true });
        return;
      case 'Tab':
        // No preventDefault: focus goes back to the button, and the browser's
        // Tab then moves on from there, as if the menu had never opened.
        close({ refocus: true });
        return;
      default:
        break;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const char = event.key.toLowerCase();
      for (let step = 1; step <= items.length; step++) {
        const index = (active + step) % items.length;
        if (items[index].label.toLowerCase().startsWith(char)) {
          setActive(index);
          return;
        }
      }
    }
  };

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close({ refocus: false }) : setActive(0))}
        onKeyDown={onButtonKeyDown}
      >
        {label}
      </button>
      {open && (
        <ul ref={menuRef} role="menu" id={menuId} aria-labelledby={buttonId} onKeyDown={onMenuKeyDown}>
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled ? 'true' : undefined}
              onClick={() => select(index)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
