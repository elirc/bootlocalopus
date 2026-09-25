// Same behaviour: a reducer, option ids derived from option ids, the label as aria-labelledby,
// the listbox always mounted but `hidden` when closed, and a <div> status.
import { useId, useReducer } from 'react';

function reducer(state, action) {
  switch (action.type) {
    case 'type': return { text: action.text, open: true, active: null };
    case 'move': return { ...state, open: true, active: action.id };
    case 'close': return { ...state, open: false, active: null };
    case 'clear': return { ...state, text: '' };
    case 'pick': return { text: action.label, open: false, active: null };
    default: return state;
  }
}

export function Combobox({ label, options, onSelect }) {
  const [state, dispatch] = useReducer(reducer, { text: '', open: false, active: null });
  const uid = useId();
  const labelId = `${uid}label`;
  const listId = `${uid}list`;
  const optId = (o) => `${uid}opt-${o.id}`;

  const q = state.text.trim().toLocaleLowerCase();
  const matches = options.filter((o) => o.label.toLocaleLowerCase().indexOf(q) !== -1);
  const expanded = state.open && matches.length > 0;
  const activeIndex = matches.findIndex((o) => o.id === state.active);

  function pick(o) {
    dispatch({ type: 'pick', label: o.label });
    onSelect(o);
  }

  function move(delta) {
    if (matches.length === 0) return;
    let next;
    if (activeIndex === -1) next = delta > 0 ? 0 : matches.length - 1;
    else next = (activeIndex + delta + matches.length) % matches.length;
    dispatch({ type: 'move', id: matches[next].id });
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      if (expanded && activeIndex !== -1) {
        e.preventDefault();
        pick(matches[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      dispatch({ type: expanded ? 'close' : 'clear' });
    }
  }

  return (
    <div className="combo">
      <span id={labelId} className="combo-label">{label}</span>
      <input
        type="text"
        role="combobox"
        aria-labelledby={labelId}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={expanded ? 'true' : 'false'}
        {...(expanded && activeIndex !== -1 ? { 'aria-activedescendant': optId(matches[activeIndex]) } : {})}
        value={state.text}
        onChange={(e) => dispatch({ type: 'type', text: e.target.value })}
        onKeyDown={handleKey}
      />
      <div id={listId} role="listbox" aria-labelledby={labelId} hidden={!expanded}>
        {expanded && matches.map((o) => (
          <div
            key={o.id}
            id={optId(o)}
            role="option"
            aria-selected={o.id === state.active ? 'true' : 'false'}
            className={o.id === state.active ? 'opt opt--active' : 'opt'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(o)}
          >
            {o.label}
          </div>
        ))}
      </div>
      {state.open && q !== '' && matches.length === 0 ? <div role="status">No results</div> : null}
    </div>
  );
}
