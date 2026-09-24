import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'react-state',
  title: 'State That Behaves',
  summary: 'Controlled inputs, derived state, reducers, custom hooks, and effects that clean up after themselves.',
  lessons: [
    {
      id: 'react-controlled-form',
      title: 'A controlled form',
      kind: 'react',
      xp: 60,
      why: 'Forms are most of the CRUD work you will be handed. Doing them cleanly is table stakes.',
      tags: ['forms', 'controlled inputs', 'state'],
      hints: [
        'Hold `const [values, setValues] = useState({ email: "", password: "" })` and write one change handler: `(e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }))`.',
        'Associate a label by wrapping the input, or with `htmlFor` + a matching `id`. Testing Library finds inputs by their label text.',
        'On the form, `onSubmit={(e) => { e.preventDefault(); ... }}` — without preventDefault the browser navigates.',
        'Compute validity during render (`const valid = values.email.includes("@") && values.password.length >= 8`) rather than storing it in state.',
      ],
    },
    {
      id: 'react-derived-state',
      title: 'Debug: state that went stale',
      kind: 'react',
      xp: 70,
      why: 'The number one React code review comment: "this does not need to be state".',
      tags: ['derived state', 'debugging', 'props'],
      hints: [
        'Anything you can compute from props or other state is not state. `const fullName = user.first + " " + user.last;` is all you need.',
        '`items.length` is already the count — read it directly instead of mirroring it into state.',
        'Once both are derived, the component needs no hooks at all. That is the goal, not a coincidence.',
      ],
    },
    {
      id: 'react-reducer-cart',
      title: 'useReducer for related state',
      kind: 'react',
      xp: 80,
      why: 'When three setStates always fire together, they were one state transition all along.',
      tags: ['useReducer', 'state machines', 'immutability'],
      hints: [
        'For `add`, check `state.lines.some((l) => l.id === item.id)` first: increment with `.map`, otherwise return `{ lines: [...state.lines, { ...item, qty: 1 }] }`.',
        'For `setQty` with `qty <= 0`, reuse the remove path — filtering the line out.',
        'The default branch must `return state` (the same object), not `{ ...state }` — that is what the reference-equality test checks.',
        'Money: `(line.price * line.qty).toFixed(2)`. Sum with `reduce` during render rather than storing a total in state.',
      ],
    },
    {
      id: 'react-custom-hooks',
      title: 'Custom hooks worth extracting',
      kind: 'react',
      xp: 85,
      why: 'A custom hook is how you reuse behaviour without a wrapper component. Knowing when to reach for one is a mid-level judgement call.',
      tags: ['custom hooks', 'useEffect', 'cleanup'],
      hints: [
        '`useCallback(() => setOn((o) => !o), [])` — the updater form means the callback never needs `on` in its dependencies, so it stays stable forever.',
        'For clamping, write one helper `const clamp = (n) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))` and apply it inside the updater.',
        'Destructure the bounds object in the parameter list, or read `bounds.min` inside — but do not put the object itself in a dependency array; a fresh `{}` literal each render would re-run the effect every time.',
        'For debouncing: `useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id); }, [value, delay])`. The returned cleanup handles both the re-run and unmount cases.',
      ],
    },
    {
      id: 'react-effect-fetch',
      title: 'Effects that clean up',
      kind: 'react',
      xp: 90,
      why: 'The race condition every React app ships: a slow first request overwrites a fast second one.',
      tags: ['useEffect', 'race conditions', 'cleanup', 'abort'],
      hints: [
        'The standard shape: `let active = true;` at the top of the effect, check `if (active)` before every setState, and `return () => { active = false; }`.',
        'Create an `AbortController` inside the effect, pass `controller.signal` to `load`, and call `controller.abort()` in the cleanup.',
        'Reset to the loading state when the effect re-runs, or the old user\'s name stays on screen while the new one loads.',
        'For retry, keep a counter in state (`const [attempt, setAttempt] = useState(0)`) and add it to the dependency array — clicking Retry bumps it, which re-runs the effect.',
        'Keep `load` out of the dependency array without lying to React: `const loadRef = useRef(load); useEffect(() => { loadRef.current = load; });` and call `loadRef.current(userId, signal)` in the fetch effect.',
      ],
    },
  ],
});
