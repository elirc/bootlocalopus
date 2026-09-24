import { useReducer } from 'react';

export function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.find((line) => line.id === action.item.id);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.id === action.item.id ? { ...line, qty: line.qty + 1 } : line,
          ),
        };
      }
      return { lines: [...state.lines, { ...action.item, qty: 1 }] };
    }
    case 'remove':
      return { lines: state.lines.filter((line) => line.id !== action.id) };
    case 'setQty':
      if (action.qty <= 0) return { lines: state.lines.filter((line) => line.id !== action.id) };
      return {
        lines: state.lines.map((line) =>
          line.id === action.id ? { ...line, qty: action.qty } : line,
        ),
      };
    case 'clear':
      return { lines: [] };
    default:
      // Same reference: React can then skip the re-render entirely.
      return state;
  }
}

export function Cart({ catalogue }) {
  const [state, dispatch] = useReducer(cartReducer, { lines: [] });
  const total = state.lines.reduce((sum, line) => sum + line.price * line.qty, 0);

  return (
    <div>
      <div>
        {catalogue.map((item) => (
          <button key={item.id} onClick={() => dispatch({ type: 'add', item })}>
            Add {item.name}
          </button>
        ))}
      </div>

      {state.lines.length === 0 ? (
        <p>Your cart is empty</p>
      ) : (
        <ul>
          {state.lines.map((line) => (
            <li key={line.id}>
              {line.name} x{line.qty} — ${(line.price * line.qty).toFixed(2)}
              <button onClick={() => dispatch({ type: 'remove', id: line.id })}>
                Remove {line.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p>Total: ${total.toFixed(2)}</p>
      <button onClick={() => dispatch({ type: 'clear' })}>Clear</button>
    </div>
  );
}
