import { useState, useMemo } from 'react';

export const workLog = [];

// Stand-ins for genuinely expensive work. Keep the workLog pushes.
export function parseCsv(text) {
  workLog.push('parse');
  return text
    .trim()
    .split('\n')
    .slice(1) // header
    .filter(Boolean)
    .map((line, index) => {
      const [date, description, amount] = line.split(',');
      return { id: index, date, description, amountCents: Math.round(Number(amount) * 100) };
    });
}

const SETTINGS_KEY = 'ledger-settings';

export function loadSettings() {
  workLog.push('load');
  try {
    return { sortBy: 'date', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { sortBy: 'date' };
  }
}

export function Ledger({ csv, currency }) {
  // Pass the function, not its result: React calls it on the first render
  // only. `useState(loadSettings())` would read storage on every render and
  // throw the answer away.
  const [settings, setSettings] = useState(loadSettings);
  const [filter, setFilter] = useState('');

  // Parse only when the text changes, not on every keystroke in the filter.
  const rows = useMemo(() => parseCsv(csv), [csv]);

  // One formatter per currency. Intl constructors are slow, and one per row
  // per render adds up fast.
  const money = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency }),
    [currency],
  );

  const visible = useMemo(() => {
    const needle = filter.toLowerCase();
    const matching = rows.filter((row) => row.description.toLowerCase().includes(needle));
    const byAmount = (a, b) => a.amountCents - b.amountCents || a.id - b.id;
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
    return matching.sort(settings.sortBy === 'amount' ? byAmount : byDate);
  }, [rows, filter, settings.sortBy]);

  const sortBy = (key) => {
    const next = { ...settings, sortBy: key };
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  return (
    <div>
      <label>
        Filter
        <input value={filter} onChange={(event) => setFilter(event.target.value)} />
      </label>
      <button type="button" aria-pressed={settings.sortBy === 'date'} onClick={() => sortBy('date')}>
        Sort by date
      </button>
      <button type="button" aria-pressed={settings.sortBy === 'amount'} onClick={() => sortBy('amount')}>
        Sort by amount
      </button>
      <ul>
        {visible.map((row) => (
          <li key={row.id}>
            {row.date} {row.description} {money.format(row.amountCents / 100)}
          </li>
        ))}
      </ul>
    </div>
  );
}
