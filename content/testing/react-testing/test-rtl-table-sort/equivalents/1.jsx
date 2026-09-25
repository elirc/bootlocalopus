// Same behaviour: a reducer, Intl.Collator, aria-sort="none" on unsorted headers,
// arrow icons hidden from assistive technology, and an empty-state row built differently.
import { useReducer } from 'react';

const collator = new Intl.Collator('en', { sensitivity: 'base' });

function reducer(state, action) {
  if (action.type === 'filter') return { ...state, filter: action.value };
  if (action.type === 'sort') {
    const flip = state.key === action.key && state.dir === 'ascending';
    return { ...state, key: action.key, dir: flip ? 'descending' : 'ascending' };
  }
  return state;
}

export function SortableTable({ columns, rows }) {
  const [state, dispatch] = useReducer(reducer, { key: null, dir: null, filter: '' });

  const q = state.filter.trim().toLocaleLowerCase('en');
  const textKeys = columns.filter((c) => c.type === 'text').map((c) => c.key);
  let shown = q === '' ? [...rows] : rows.filter((r) => textKeys.some((k) => `${r[k]}`.toLocaleLowerCase('en').includes(q)));

  if (state.key !== null) {
    const col = columns.find((c) => c.key === state.key);
    const base = col.type === 'number'
      ? (a, b) => a[col.key] - b[col.key]
      : (a, b) => collator.compare(`${a[col.key]}`, `${b[col.key]}`);
    // Array.prototype.sort is stable, so ties keep their order in both directions.
    shown = shown.sort(state.dir === 'ascending' ? base : (a, b) => base(b, a));
  }

  return (
    <section className="data-table">
      <div className="toolbar">
        <label htmlFor="tbl-filter">Filter</label>
        <input id="tbl-filter" type="search" value={state.filter} onChange={(e) => dispatch({ type: 'filter', value: e.target.value })} />
        <span role="status" className="count">{`Showing ${shown.length} of ${rows.length}`}</span>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = state.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? state.dir : 'none'}>
                  <button className="sort" onClick={() => dispatch({ type: 'sort', key: c.key })}>
                    {c.label}
                    <span aria-hidden="true">{active ? (state.dir === 'ascending' ? ' ▲' : ' ▼') : ' ↕'}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>{columns.map((c) => <td key={c.key}>{String(r[c.key])}</td>)}</tr>
          ))}
          {shown.length === 0 && (
            <tr className="empty"><td colSpan={columns.length}><em>No matching rows</em></td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
