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
  const [settings, setSettings] = useState(loadSettings());
  const [filter, setFilter] = useState('');

  const rows = parseCsv(csv);

  const needle = filter.toLowerCase();
  const visible = rows
    .filter((row) => row.description.toLowerCase().includes(needle))
    .sort(settings.sortBy === 'amount'
      ? (a, b) => a.amountCents - b.amountCents || a.id - b.id
      : (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

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
            {row.date} {row.description}{' '}
            {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(row.amountCents / 100)}
          </li>
        ))}
      </ul>
    </div>
  );
}
