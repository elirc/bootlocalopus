import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'react-composition',
  title: 'Composition & Renders',
  summary: 'Context, compound components, render props, keys, and renders you can account for.',
  lessons: [
    {
      id: 'react-compound-tabs',
      title: 'Compound components with context',
      kind: 'react',
      xp: 95,
      why: 'The pattern behind every good component library. It is how you avoid a component with 19 props.',
      tags: ['context', 'composition', 'component api'],
      hints: [
        'Write one `useTabs()` helper: `const ctx = useContext(TabsContext); if (!ctx) throw new Error("<Tabs.X> must be used inside <Tabs>"); return ctx;` and call it from all three children.',
        'Memoise the context value with `useMemo(() => ({ active, setActive }), [active])` so consumers do not re-render on unrelated parent renders.',
        '`aria-selected={active === value}` — React renders that as the string "true"/"false" in the DOM, which is what assistive tech expects.',
        '`Tabs.Panel` returns `null` when `active !== value` — the tests expect an inactive panel to be absent. (A `hidden` panel would also be fine for screen readers, since hidden content is excluded from the accessibility tree; it is the choice when a panel holds state worth keeping.)',
      ],
    },
    {
      id: 'react-render-props',
      title: 'Render props and children as a function',
      kind: 'react',
      xp: 80,
      why: 'Hooks replaced most render props, but the pattern is still how you share *rendering* rather than logic.',
      tags: ['composition', 'render props', 'children'],
      hints: [
        'A render prop is called, not rendered: `{items.map((item, i) => <li key={i}>{children(item, i)}</li>)}`.',
        'Returning the consumer\'s render output directly is fine — `return children({ on, toggle })` — React accepts any valid element from a component.',
        'For `Resource`, reuse the cleanup pattern: an `active` flag flipped in the effect cleanup so a late response cannot set state.',
        'Load once: hold `load` in a `useRef` and give the effect an empty dependency list. `[load]` refetches every time a parent passes a new inline arrow.',
        'Give `List` a stable key when the item has an `id`, falling back to the index only when it does not.',
      ],
    },
    {
      id: 'react-memo-renders',
      title: 'Renders you can account for',
      kind: 'react',
      xp: 90,
      why: 'Sprinkling memo everywhere is cargo cult. Knowing exactly why a component re-rendered is the skill.',
      tags: ['performance', 'memo', 'useCallback', 'useMemo'],
      hints: [
        'Wrap the row: `export const ExpensiveRow = memo(ExpensiveRowImpl);`. That alone is not enough — its props must also be stable.',
        '`const onSelect = useCallback((id) => setSelected(id), []);` — the setter from useState is stable, so the dependency list is empty.',
        '`const visible = useMemo(() => items.filter(...), [items, filter]);` keeps the array identity stable when neither input changed — which is exactly what the memoised `Summary` needs.',
        'The `selected` prop is a boolean, so it only changes for the two rows whose selection actually flipped — nothing extra needed there.',
        'Note what memo cannot fix: the parent itself still re-renders. Memo stops the work from cascading down, which is the point.',
      ],
    },
    {
      id: 'react-keys-debug',
      title: 'Debug: keys and lost state',
      kind: 'react',
      xp: 75,
      why: 'Index keys are the bug that makes a form "randomly" swap the user\'s typing between rows.',
      tags: ['keys', 'reconciliation', 'debugging'],
      hints: [
        'Find where the list is rendered and look at what React is told each row *is*. Deleting row 0 shifts every index down by one.',
        'A key must be stable (the same value across renders for the same item), unique among siblings, and derived from the data — never from the position.',
        'Index keys are only safe for a list that is append-only and never reordered, filtered, or stateful.',
        'The fix is `key={todo.id}`.',
      ],
    },
  ],
});
