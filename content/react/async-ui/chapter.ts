import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'react-async-ui',
  title: 'Async UI & Quality',
  summary: 'Every state a real screen has, optimistic updates, accessibility, and a data table boss.',
  lessons: [
    {
      id: 'react-optimistic',
      title: 'Optimistic updates with rollback',
      kind: 'react',
      xp: 100,
      why: 'Makes an app feel instant. Doing it without a rollback path is how you lose user data.',
      tags: ['async', 'optimistic ui', 'error handling'],
      hints: [
        'Capture the previous values *before* you change them: `const prevLiked = liked; const prevLikes = likes;` — then restore those exact values in the catch block.',
        'Set the new state first, then `await save(next)` inside a try/catch. That ordering is what makes it optimistic.',
        'Track `const [saving, setSaving] = useState(false)` and clear it in a `finally` so a rejection cannot leave the button stuck.',
        'Clear the error at the start of each attempt so a later success removes the message.',
      ],
    },
    {
      id: 'react-a11y-modal',
      title: 'An accessible dialog',
      kind: 'react',
      xp: 95,
      why: 'Modals are where accessibility gets skipped. Getting the basics right is the first step to a dialog people can actually use.',
      tags: ['accessibility', 'focus management', 'events'],
      hints: [
        '`useId()` gives you a stable unique id for the heading, which `aria-labelledby` references.',
        'Attach the key handler in an effect that depends on `[open]` only, and return `() => document.removeEventListener("keydown", handler)`.',
        '`onClose` is usually an inline arrow, new on every parent render. Read it through a ref (`const onCloseRef = useRef(onClose); useEffect(() => { onCloseRef.current = onClose; });`) so a re-render does not re-run the focus effect.',
        'Save the previously focused element before moving focus: `const previous = document.activeElement;` in the effect, then `previous?.focus()` in the cleanup.',
        'To focus a div, it needs to be focusable: give the dialog `tabIndex={-1}` and call `ref.current.focus()`.',
      ],
    },
    {
      id: 'react-error-boundary',
      title: 'Error boundaries and recovery',
      kind: 'react',
      xp: 90,
      why: 'Without a boundary, one throwing widget blanks the whole page. With one, the page degrades to a retry button.',
      tags: ['error handling', 'class components', 'resilience'],
      hints: [
        'Two lifecycle hooks do the work: `static getDerivedStateFromError(error)` returns the state that shows the fallback, and `componentDidCatch(error, info)` is where `onError` gets called (it runs once, in the commit phase).',
        'Store a `didCatch` flag next to the error rather than testing `error !== null`: `throw null` is legal JavaScript.',
        'Make `reset` an arrow class property (`reset = () => this.setState({ didCatch: false, error: null })`) so the fallback can call it without binding.',
        'In `componentDidUpdate(prevProps, prevState)`, reset only when `this.state.didCatch && prevState.didCatch` and the keys differ: `a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]))`.',
      ],
    },
    {
      id: 'react-data-table',
      title: 'BOSS: sortable, filterable, paginated table',
      kind: 'react',
      xp: 240,
      boss: true,
      why: 'The single most requested feature in internal tooling, and a genuine test of state design.',
      tags: ['state design', 'useMemo', 'accessibility', 'composition'],
      hints: [
        'Filter by joining every value: `columns.some((c) => String(row[c.key]).toLowerCase().includes(needle))`.',
        'Sort on a copy — `[...filtered].sort(...)` — because `Array.prototype.sort` mutates, and mutating the memoised filter result would corrupt it.',
        'Compare by type: `typeof a === "number" ? a - b : String(a).localeCompare(String(b))`, then negate the result when the direction is descending.',
        'Slice for the page: `const start = (page - 1) * pageSize;` then `sorted.slice(start, start + pageSize)`.',
        'To "reset to page 1", set page inside the same handler that changes search or sort — do not use an effect to sync it, that renders a stale page first.',
        'Clamp the page when the filter shrinks the results: `const totalPages = Math.max(1, Math.ceil(count / pageSize))` and use `Math.min(page, totalPages)` when slicing.',
      ],
    },
  ],
});
