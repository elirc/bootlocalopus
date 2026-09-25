A component function runs on **every** render, and a text input re-renders
its component on every keystroke. Anything expensive written straight into
the body runs that often too:

- `useState(loadSettings())` calls `loadSettings()` on every render. React
  uses the result only the first time and throws the rest away, but the
  storage read and JSON parse still happen.
- `const rows = parseCsv(csv)` re-parses the whole file every time the user
  types a letter into the filter box.
- `new Intl.NumberFormat(...)` inside `rows.map(...)` builds one formatter
  per row per render. Intl constructors load locale data and are far slower
  than calling `.format()` on one you already have.

None of these is a bug you can see. Together they are why a ledger with a few
thousand rows lags when you type.

## Task

`Ledger({ csv, currency })` renders a filterable, sortable list of
transactions. Keep everything it renders and does, including the
`workLog.push(...)` calls in `parseCsv` and `loadSettings` (that is how the
grader counts the work), and make it do the expensive work only when it must:

- `loadSettings` runs **once**, on mount, however often the ledger re-renders.
- `parseCsv` runs once on mount, and again **only when `csv` changes**. Typing
  in the filter or changing the sort must not re-parse. A new `csv` string
  with the same text is not a change.
- At most **one** `Intl.NumberFormat` is built across a mount and several
  re-renders with the same `currency`. When `currency` changes, the list
  shows the new currency.

Behaviour that must not change: rows sorted by date (then by original
order), `Sort by date` / `Sort by amount` buttons with `aria-pressed`, the
choice saved to `localStorage` under `ledger-settings`, and a case-insensitive
`Filter` on the description.

Only memoise what is expensive. A `useMemo` around `a + b` costs more than it
saves, and every one of them is a dependency array someone has to keep right.
