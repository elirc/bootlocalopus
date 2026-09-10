import { track } from '../types.ts';

export const reactTrack = track({
  id: 'react',
  title: 'React Patterns & Performance',
  icon: '⚛',
  color: '#61dafb',
  weight: 1.1,
  blurb: 'Component design that survives contact with a real product: derived state, composition, effects that clean up, and renders you can account for. Graded by rendering your components with Testing Library.',
  chapters: [
    /* ================================================================== */
    {
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
          brief: `A controlled input's value comes from state, so state is always the truth.
The mistakes are keeping one \`useState\` per field forever, forgetting
\`preventDefault\`, and validating on submit only.

## Task

Export \`SignupForm({ onSubmit })\`:

- Two inputs, \`email\` and \`password\`, held in **one** state object
- Each input has an accessible label matching its name (\`Email\`, \`Password\`)
- The submit button reads \`Sign up\` and is **disabled** until the email
  contains an \`@\` and the password is at least 8 characters
- On submit, call \`onSubmit({ email, password })\` and do **not** reload the page
- After a successful submit, both fields are cleared`,
          starter: `import { useState } from 'react';

export function SignupForm({ onSubmit }) {
  // TODO: one state object for both fields
  return (
    <form>
      {/* TODO */}
    </form>
  );
}
`,
          hints: [
            'Hold `const [values, setValues] = useState({ email: "", password: "" })` and write one change handler: `(e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }))`.',
            'Associate a label by wrapping the input, or with `htmlFor` + a matching `id`. Testing Library finds inputs by their label text.',
            'On the form, `onSubmit={(e) => { e.preventDefault(); ... }}` — without preventDefault the browser navigates.',
            'Compute validity during render (`const valid = values.email.includes("@") && values.password.length >= 8`) rather than storing it in state.',
          ],
          solution: `import { useState } from 'react';

const EMPTY = { email: '', password: '' };

export function SignupForm({ onSubmit }) {
  const [values, setValues] = useState(EMPTY);

  // Derived during render, so it can never disagree with the fields.
  const valid = values.email.includes('@') && values.password.length >= 8;

  const change = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!valid) return;
    onSubmit({ ...values });
    setValues(EMPTY);
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" value={values.email} onChange={change} />

      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" value={values.password} onChange={change} />

      <button type="submit" disabled={!valid}>Sign up</button>
    </form>
  );
}
`,
          tests: `const type = (label, value) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  return input;
};

describe('SignupForm', () => {
  it('renders labelled fields and a submit button', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy();
  });

  it('is controlled: typing updates the input value', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    const email = type('Email', 'ada@example.com');
    expect(email.value).toBe('ada@example.com');
  });

  it('disables submit until both fields are valid', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    const button = screen.getByRole('button', { name: 'Sign up' });
    expect(button.disabled).toBe(true);

    type('Email', 'ada@example.com');
    expect(button.disabled).toBe(true);

    type('Password', 'short');
    expect(button.disabled).toBe(true);

    type('Password', 'longenough');
    expect(button.disabled).toBe(false);
  });

  it('rejects an email with no @', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'not-an-email');
    type('Password', 'longenough');
    expect(screen.getByRole('button', { name: 'Sign up' }).disabled).toBe(true);
  });

  it('submits the values', () => {
    const seen = [];
    render(<solution.SignupForm onSubmit={(v) => seen.push(v)} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(seen).toEqual([{ email: 'ada@example.com', password: 'hunter2hunter2' }]);
  });

  it('clears the fields after submitting', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByLabelText('Email').value).toBe('');
    expect(screen.getByLabelText('Password').value).toBe('');
  });

  it('keeps both fields in one state object', () => {
    // Changing one field must not reset the other.
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    expect(screen.getByLabelText('Email').value).toBe('ada@example.com');
    expect(screen.getByLabelText('Password').value).toBe('hunter2hunter2');
  });

  it('prevents the default form submission', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    type('Email', 'ada@example.com');
    type('Password', 'hunter2hunter2');
    const form = screen.getByRole('button', { name: 'Sign up' }).closest('form');
    const event = new window.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});`,
        },
        {
          id: 'react-derived-state',
          title: 'Debug: state that went stale',
          kind: 'react',
          xp: 70,
          why: 'The number one React code review comment: "this does not need to be state".',
          tags: ['derived state', 'debugging', 'props'],
          brief: `Copying props into state creates two sources of truth. The copy is taken
once, on mount, and then quietly drifts.

## Task

\`UserCard\` below has two bugs of exactly this kind:

1. \`fullName\` is copied into state, so it never updates when the \`user\` prop
   changes.
2. \`itemCount\` is stored in state and synced in an effect, which renders one
   frame of stale data and re-renders twice.

Fix both by **deriving during render**. Keep the same props and rendered
output. Do not add \`useEffect\`; remove the one that is there.

The component must render:

- an \`<h2>\` with the full name (\`first last\`)
- a \`<p>\` reading \`\`\`\`3 items\`\`\`\` (or \`\`\`\`1 item\`\`\`\` when singular)
- a \`<span>\` reading \`Verified\` or \`Unverified\``,
          starter: `import { useState, useEffect } from 'react';

export function UserCard({ user, items }) {
  // BUG: a snapshot of the prop, taken once on mount
  const [fullName] = useState(user.first + ' ' + user.last);

  // BUG: state that mirrors a prop, one render behind
  const [itemCount, setItemCount] = useState(0);
  useEffect(() => {
    setItemCount(items.length);
  }, [items]);

  return (
    <div>
      <h2>{fullName}</h2>
      <p>{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      <span>{user.verified ? 'Verified' : 'Unverified'}</span>
    </div>
  );
}
`,
          hints: [
            'Anything you can compute from props or other state is not state. `const fullName = user.first + " " + user.last;` is all you need.',
            '`items.length` is already the count — read it directly instead of mirroring it into state.',
            'Once both are derived, the component needs no hooks at all. That is the goal, not a coincidence.',
          ],
          solution: `export function UserCard({ user, items }) {
  // Derived during render: it cannot go stale, and there is no extra render.
  const fullName = user.first + ' ' + user.last;
  const itemCount = items.length;

  return (
    <div>
      <h2>{fullName}</h2>
      <p>{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      <span>{user.verified ? 'Verified' : 'Unverified'}</span>
    </div>
  );
}
`,
          tests: `const ada = { first: 'Ada', last: 'Lovelace', verified: true };
const bob = { first: 'Bob', last: 'Brown', verified: false };

describe('UserCard', () => {
  it('renders the full name, count and status', () => {
    render(<solution.UserCard user={ada} items={[1, 2, 3]} />);
    expect(screen.getByRole('heading').textContent).toBe('Ada Lovelace');
    expect(screen.getByText('3 items')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('pluralises correctly', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[1]} />);
    expect(screen.getByText('1 item')).toBeTruthy();
    rerender(<solution.UserCard user={ada} items={[]} />);
    expect(screen.getByText('0 items')).toBeTruthy();
  });

  it('updates the name when the user prop changes', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[]} />);
    expect(screen.getByRole('heading').textContent).toBe('Ada Lovelace');
    rerender(<solution.UserCard user={bob} items={[]} />);
    expect(screen.getByRole('heading').textContent).toBe('Bob Brown');
  });

  it('updates the count when the items prop changes', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[1, 2]} />);
    expect(screen.getByText('2 items')).toBeTruthy();
    rerender(<solution.UserCard user={ada} items={[1, 2, 3, 4]} />);
    expect(screen.getByText('4 items')).toBeTruthy();
  });

  it('shows the count on the very first render, not one render late', () => {
    // A useEffect-based sync renders 0 first. Deriving shows 3 immediately.
    let firstPaint;
    const Probe = () => {
      const node = <solution.UserCard user={ada} items={[1, 2, 3]} />;
      return node;
    };
    const { container } = render(<Probe />);
    firstPaint = container.querySelector('p').textContent;
    expect(firstPaint).toBe('3 items');
  });

  it('updates status with the prop', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[]} />);
    expect(screen.getByText('Verified')).toBeTruthy();
    rerender(<solution.UserCard user={bob} items={[]} />);
    expect(screen.getByText('Unverified')).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
  });

  it('holds no state at all any more', () => {
    // Both values are derivable from props, so the component should be pure.
    const source = solution.UserCard.toString();
    expect(source).not.toContain('useState');
    expect(source).not.toContain('useEffect');
  });
});`,
        },
        {
          id: 'react-reducer-cart',
          title: 'useReducer for related state',
          kind: 'react',
          xp: 80,
          why: 'When three setStates always fire together, they were one state transition all along.',
          tags: ['useReducer', 'state machines', 'immutability'],
          brief: `\`useReducer\` wins when updates involve several fields at once, or when the
next state depends on the previous in a non-trivial way. The reducer is a pure
function, so it is trivially testable — which is why this lesson tests it
directly as well as through the UI.

## Task

Export both a pure \`cartReducer(state, action)\` and a \`Cart({ catalogue })\`
component.

State: \`{ lines: [{ id, name, price, qty }] }\`.

Actions:

- \`{ type: 'add', item }\` — append with \`qty: 1\`, or increment if already present
- \`{ type: 'remove', id }\`
- \`{ type: 'setQty', id, qty }\` — a qty of 0 or less removes the line
- \`{ type: 'clear' }\`
- an unknown action returns the **same state object** (reference equality)

The reducer must never mutate its input.

\`Cart\` renders an \`Add <name>\` button per catalogue item, a list item per line
reading \`\`\`\`Widget x2 — $19.98\`\`\`\` (price × qty, 2 decimals), and a total
\`\`\`\`Total: $19.98\`\`\`\`. Empty cart shows \`Your cart is empty\`.`,
          starter: `import { useReducer } from 'react';

export function cartReducer(state, action) {
  // TODO
  return state;
}

export function Cart({ catalogue }) {
  const [state, dispatch] = useReducer(cartReducer, { lines: [] });
  // TODO
  return <div />;
}
`,
          hints: [
            'For `add`, check `state.lines.some((l) => l.id === item.id)` first: increment with `.map`, otherwise return `{ lines: [...state.lines, { ...item, qty: 1 }] }`.',
            'For `setQty` with `qty <= 0`, reuse the remove path — filtering the line out.',
            'The default branch must `return state` (the same object), not `{ ...state }` — that is what the reference-equality test checks.',
            'Money: `(line.price * line.qty).toFixed(2)`. Sum with `reduce` during render rather than storing a total in state.',
          ],
          solution: `import { useReducer } from 'react';

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
              {line.name} x{line.qty} — \${(line.price * line.qty).toFixed(2)}
              <button onClick={() => dispatch({ type: 'remove', id: line.id })}>
                Remove {line.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p>Total: \${total.toFixed(2)}</p>
      <button onClick={() => dispatch({ type: 'clear' })}>Clear</button>
    </div>
  );
}
`,
          tests: `const widget = { id: 'w', name: 'Widget', price: 9.99 };
const gadget = { id: 'g', name: 'Gadget', price: 4.5 };
const catalogue = [widget, gadget];

describe('cartReducer (pure)', () => {
  const empty = { lines: [] };

  it('adds a new line with qty 1', () => {
    expect(solution.cartReducer(empty, { type: 'add', item: widget })).toEqual({
      lines: [{ id: 'w', name: 'Widget', price: 9.99, qty: 1 }],
    });
  });

  it('increments an existing line instead of duplicating it', () => {
    const once = solution.cartReducer(empty, { type: 'add', item: widget });
    const twice = solution.cartReducer(once, { type: 'add', item: widget });
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0].qty).toBe(2);
  });

  it('does not mutate the previous state', () => {
    const once = solution.cartReducer(empty, { type: 'add', item: widget });
    const snapshot = JSON.stringify(once);
    solution.cartReducer(once, { type: 'add', item: widget });
    solution.cartReducer(once, { type: 'setQty', id: 'w', qty: 7 });
    solution.cartReducer(once, { type: 'remove', id: 'w' });
    expect(JSON.stringify(once)).toBe(snapshot);
  });

  it('removes a line', () => {
    const state = { lines: [{ ...widget, qty: 1 }, { ...gadget, qty: 2 }] };
    expect(solution.cartReducer(state, { type: 'remove', id: 'w' }).lines).toEqual([
      { ...gadget, qty: 2 },
    ]);
  });

  it('sets a quantity', () => {
    const state = { lines: [{ ...widget, qty: 1 }] };
    expect(solution.cartReducer(state, { type: 'setQty', id: 'w', qty: 5 }).lines[0].qty).toBe(5);
  });

  it('treats a quantity of 0 or less as a removal', () => {
    const state = { lines: [{ ...widget, qty: 3 }] };
    expect(solution.cartReducer(state, { type: 'setQty', id: 'w', qty: 0 }).lines).toEqual([]);
    expect(solution.cartReducer(state, { type: 'setQty', id: 'w', qty: -2 }).lines).toEqual([]);
  });

  it('clears', () => {
    const state = { lines: [{ ...widget, qty: 3 }] };
    expect(solution.cartReducer(state, { type: 'clear' })).toEqual({ lines: [] });
  });

  it('returns the identical state object for an unknown action', () => {
    const state = { lines: [] };
    expect(solution.cartReducer(state, { type: 'nonsense' })).toBe(state);
  });
});

describe('Cart (rendered)', () => {
  it('starts empty', () => {
    render(<solution.Cart catalogue={catalogue} />);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    expect(screen.getByText('Total: $0.00')).toBeTruthy();
  });

  it('adds an item', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    expect(screen.getByText(/Widget x1/)).toBeTruthy();
    expect(screen.getByText('Total: $9.99')).toBeTruthy();
    expect(screen.queryByText('Your cart is empty')).toBeNull();
  });

  it('increments on a second add and totals correctly', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    expect(screen.getByText(/Widget x2/)).toBeTruthy();
    const lines = screen.getAllByRole('listitem');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain('$19.98');
    expect(screen.getByText('Total: $19.98')).toBeTruthy();
  });

  it('totals across several products', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Gadget' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Total: $14.49')).toBeTruthy();
  });

  it('removes a line', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Widget' }));
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    expect(screen.getByText('Total: $0.00')).toBeTruthy();
  });

  it('clears everything', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Gadget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
  });
});`,
        },
        {
          id: 'react-custom-hooks',
          title: 'Custom hooks worth extracting',
          kind: 'react',
          xp: 85,
          why: 'A custom hook is how you reuse behaviour without a wrapper component. Knowing when to reach for one is a mid-level judgement call.',
          tags: ['custom hooks', 'useEffect', 'cleanup'],
          brief: `A custom hook is just a function calling other hooks. The value is in
packaging a *behaviour* — with its cleanup — so call sites stay boring.

## Task

Export three hooks:

- \`useToggle(initial = false)\` — returns \`[on, toggle, set]\`. \`toggle\` takes no
  arguments and must be **referentially stable** across renders.
- \`useCounter(start = 0, { min, max } = {})\` — returns
  \`{ count, inc, dec, reset }\`, clamped to the bounds when given.
- \`useDebouncedValue(value, delay)\` — returns the value, but only after it has
  stopped changing for \`delay\` ms. Must clear its pending timer on change and
  on unmount (no "update after unmount" leaks).

All callbacks must be stable — a new function identity every render defeats
\`memo\` downstream.`,
          starter: `import { useState, useCallback, useEffect, useRef } from 'react';

export function useToggle(initial = false) {
  // TODO
}

export function useCounter(start = 0, bounds = {}) {
  // TODO
}

export function useDebouncedValue(value, delay) {
  // TODO
}
`,
          hints: [
            '`useCallback(() => setOn((o) => !o), [])` — the updater form means the callback never needs `on` in its dependencies, so it stays stable forever.',
            'For clamping, write one helper `const clamp = (n) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))` and apply it inside the updater.',
            'Destructure the bounds object in the parameter list, or read `bounds.min` inside — but do not put the object itself in a dependency array; a fresh `{}` literal each render would re-run the effect every time.',
            'For debouncing: `useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id); }, [value, delay])`. The returned cleanup handles both the re-run and unmount cases.',
          ],
          solution: `import { useState, useCallback, useEffect } from 'react';

export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  // The updater form keeps the dependency list empty, so toggle is stable.
  const toggle = useCallback(() => setOn((current) => !current), []);
  return [on, toggle, setOn];
}

export function useCounter(start = 0, { min, max } = {}) {
  const [count, setCount] = useState(start);

  const clamp = useCallback(
    (n) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)),
    [min, max],
  );

  const inc = useCallback(() => setCount((c) => clamp(c + 1)), [clamp]);
  const dec = useCallback(() => setCount((c) => clamp(c - 1)), [clamp]);
  const reset = useCallback(() => setCount(clamp(start)), [clamp, start]);

  return { count, inc, dec, reset };
}

export function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    // Runs before the next effect and on unmount, so no stray updates.
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('useToggle', () => {
  it('starts false by default and flips', () => {
    const { result } = renderHook(() => solution.useToggle());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it('accepts an initial value', () => {
    const { result } = renderHook(() => solution.useToggle(true));
    expect(result.current[0]).toBe(true);
  });

  it('exposes a setter for forcing a value', () => {
    const { result } = renderHook(() => solution.useToggle());
    act(() => result.current[2](true));
    expect(result.current[0]).toBe(true);
  });

  it('keeps toggle referentially stable across renders', () => {
    const { result, rerender } = renderHook(() => solution.useToggle());
    const first = result.current[1];
    act(() => result.current[1]());
    rerender();
    expect(result.current[1]).toBe(first);
  });
});

describe('useCounter', () => {
  it('counts up and down from a start value', () => {
    const { result } = renderHook(() => solution.useCounter(5));
    expect(result.current.count).toBe(5);
    act(() => result.current.inc());
    expect(result.current.count).toBe(6);
    act(() => result.current.dec());
    act(() => result.current.dec());
    expect(result.current.count).toBe(4);
  });

  it('defaults to 0', () => {
    const { result } = renderHook(() => solution.useCounter());
    expect(result.current.count).toBe(0);
  });

  it('clamps to max', () => {
    const { result } = renderHook(() => solution.useCounter(0, { max: 2 }));
    act(() => result.current.inc());
    act(() => result.current.inc());
    act(() => result.current.inc());
    act(() => result.current.inc());
    expect(result.current.count).toBe(2);
  });

  it('clamps to min', () => {
    const { result } = renderHook(() => solution.useCounter(1, { min: 0 }));
    act(() => result.current.dec());
    act(() => result.current.dec());
    expect(result.current.count).toBe(0);
  });

  it('resets to the start value', () => {
    const { result } = renderHook(() => solution.useCounter(3));
    act(() => result.current.inc());
    act(() => result.current.reset());
    expect(result.current.count).toBe(3);
  });

  it('keeps its callbacks stable when only the count changes', () => {
    const { result } = renderHook(() => solution.useCounter(0));
    const { inc, dec, reset } = result.current;
    act(() => result.current.inc());
    expect(result.current.inc).toBe(inc);
    expect(result.current.dec).toBe(dec);
    expect(result.current.reset).toBe(reset);
  });
});

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => solution.useDebouncedValue('first', 20));
    expect(result.current).toBe('first');
  });

  it('waits for the delay before reporting a change', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => solution.useDebouncedValue(value, 40),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    await waitFor(() => expect(result.current).toBe('b'));
  });

  it('only reports the last value in a burst', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => solution.useDebouncedValue(value, 40),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    rerender({ value: 'd' });
    expect(result.current).toBe('a');
    await waitFor(() => expect(result.current).toBe('d'));
    await sleep(60);
    expect(result.current).toBe('d');
  });

  it('clears its timer on unmount', async () => {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
      const { rerender, unmount } = renderHook(
        ({ value }) => solution.useDebouncedValue(value, 20),
        { initialProps: { value: 'a' } },
      );
      rerender({ value: 'b' });
      unmount();
      await sleep(60);
    } finally {
      console.error = originalError;
    }
    expect(errors.join(' ')).not.toContain('unmounted');
  });
});`,
        },
        {
          id: 'react-effect-fetch',
          title: 'Effects that clean up',
          kind: 'react',
          xp: 90,
          why: 'The race condition every React app ships: a slow first request overwrites a fast second one.',
          tags: ['useEffect', 'race conditions', 'cleanup', 'abort'],
          brief: `Fetching in an effect has two classic bugs:

1. **The race.** Props change, a second request starts, the *first* one resolves
   last and overwrites fresh data with stale data.
2. **The leak.** The component unmounts and the resolved promise still calls
   \`setState\`.

Both are fixed by the effect's cleanup function.

## Task

Export \`UserProfile({ userId, load })\` where \`load(id, signal)\` returns a
promise for \`{ name }\`.

- while loading, render \`Loading…\`
- on success, render an \`<h2>\` with the name
- on failure, render \`Something went wrong\` plus a \`Retry\` button that
  refetches
- when \`userId\` changes, refetch and ignore any in-flight response for the old
  id — even if it resolves later
- pass an \`AbortSignal\` to \`load\` and abort it on cleanup
- never call \`setState\` after unmount`,
          starter: `import { useState, useEffect } from 'react';

export function UserProfile({ userId, load }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    // TODO: fetch, and clean up so a stale response cannot win
  }, [userId]);

  // TODO: render by status
  return null;
}
`,
          hints: [
            'The standard shape: `let active = true;` at the top of the effect, check `if (active)` before every setState, and `return () => { active = false; }`.',
            'Create an `AbortController` inside the effect, pass `controller.signal` to `load`, and call `controller.abort()` in the cleanup.',
            'Reset to the loading state when the effect re-runs, or the old user\'s name stays on screen while the new one loads.',
            'For retry, keep a counter in state (`const [attempt, setAttempt] = useState(0)`) and add it to the dependency array — clicking Retry bumps it, which re-runs the effect.',
          ],
          solution: `import { useState, useEffect } from 'react';

export function UserProfile({ userId, load }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading' });

    load(userId, controller.signal).then(
      (user) => {
        // \`active\` is false if this effect has already been cleaned up, which
        // is what stops a slow first response overwriting a fast second one.
        if (active) setState({ status: 'success', user });
      },
      () => {
        if (active) setState({ status: 'error' });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, load, attempt]);

  if (state.status === 'loading') return <p>Loading…</p>;
  if (state.status === 'error') {
    return (
      <div>
        <p>Something went wrong</p>
        <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
      </div>
    );
  }
  return <h2>{state.user.name}</h2>;
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('UserProfile', () => {
  it('shows a loading state first', () => {
    render(<solution.UserProfile userId="1" load={() => new Promise(() => {})} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders the name on success', async () => {
    render(<solution.UserProfile userId="1" load={async () => ({ name: 'Ada' })} />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada'));
  });

  it('renders an error state with a retry button', async () => {
    render(<solution.UserProfile userId="1" load={async () => { throw new Error('offline'); }} />);
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('retry refetches and can succeed', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return { name: 'Ada' };
    };
    render(<solution.UserProfile userId="1" load={load} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada'));
    expect(calls).toBe(2);
  });

  it('refetches when userId changes', async () => {
    const seen = [];
    const load = async (id) => { seen.push(id); return { name: 'user ' + id }; };
    const { rerender } = render(<solution.UserProfile userId="1" load={load} />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('user 1'));
    rerender(<solution.UserProfile userId="2" load={load} />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('user 2'));
    expect(seen).toEqual(['1', '2']);
  });

  it('goes back to loading while the new user is in flight', async () => {
    const first = deferred();
    const second = deferred();
    const load = (id) => (id === '1' ? first.promise : second.promise);
    const { rerender } = render(<solution.UserProfile userId="1" load={load} />);
    await act(async () => { first.resolve({ name: 'Ada' }); });
    expect(screen.getByRole('heading').textContent).toBe('Ada');

    rerender(<solution.UserProfile userId="2" load={load} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    await act(async () => { second.resolve({ name: 'Bob' }); });
    expect(screen.getByRole('heading').textContent).toBe('Bob');
  });

  it('ignores a stale response that resolves last', async () => {
    const first = deferred();
    const second = deferred();
    const load = (id) => (id === '1' ? first.promise : second.promise);

    const { rerender } = render(<solution.UserProfile userId="1" load={load} />);
    rerender(<solution.UserProfile userId="2" load={load} />);

    // The second request wins the race...
    await act(async () => { second.resolve({ name: 'Bob' }); });
    expect(screen.getByRole('heading').textContent).toBe('Bob');

    // ...and the first, arriving late, must not overwrite it.
    await act(async () => { first.resolve({ name: 'Ada (stale)' }); });
    await sleep(10);
    expect(screen.getByRole('heading').textContent).toBe('Bob');
  });

  it('passes an AbortSignal and aborts it on cleanup', async () => {
    const signals = [];
    const load = (id, signal) => { signals.push(signal); return new Promise(() => {}); };
    const { unmount } = render(<solution.UserProfile userId="1" load={load} />);
    expect(signals[0]).toBeDefined();
    expect(signals[0].aborted).toBe(false);
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it('does not set state after unmount', async () => {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    const pending = deferred();
    try {
      const { unmount } = render(<solution.UserProfile userId="1" load={() => pending.promise} />);
      unmount();
      pending.resolve({ name: 'Late' });
      await sleep(20);
    } finally {
      console.error = originalError;
    }
    expect(errors.join(' ')).not.toContain('unmounted');
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
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
          brief: `\`<Tabs items={...} renderTab={...} activeIndex={...} onTabChange={...} />\`
is a component that will grow forever. Compound components invert it: the
parent owns state, the children read it from context, and the consumer controls
the markup.

## Task

Export \`Tabs\` with three attached components:

\`\`\`jsx
<Tabs defaultValue="a">
  <Tabs.List>
    <Tabs.Tab value="a">First</Tabs.Tab>
    <Tabs.Tab value="b">Second</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="a">First panel</Tabs.Panel>
  <Tabs.Panel value="b">Second panel</Tabs.Panel>
</Tabs>
\`\`\`

Requirements:

- \`Tabs.List\` renders a \`<div role="tablist">\`
- \`Tabs.Tab\` renders a \`<button role="tab">\` with
  \`aria-selected\` true/false, and selects itself on click
- \`Tabs.Panel\` renders its children in a \`<div role="tabpanel">\` **only** when
  it is the active tab
- rendering any of the three outside a \`Tabs\` throws an error whose message
  contains \`must be used inside <Tabs>\``,
          starter: `import { createContext, useContext, useMemo, useState } from 'react';

const TabsContext = createContext(null);

export function Tabs({ defaultValue, children }) {
  // TODO
  return <div>{children}</div>;
}

Tabs.List = function TabsList({ children }) {
  return null;  // TODO
};

Tabs.Tab = function TabsTab({ value, children }) {
  return null;  // TODO
};

Tabs.Panel = function TabsPanel({ value, children }) {
  return null;  // TODO
};
`,
          hints: [
            'Write one `useTabs()` helper: `const ctx = useContext(TabsContext); if (!ctx) throw new Error("<Tabs.X> must be used inside <Tabs>"); return ctx;` and call it from all three children.',
            'Memoise the context value with `useMemo(() => ({ active, setActive }), [active])` so consumers do not re-render on unrelated parent renders.',
            '`aria-selected={active === value}` — React renders that as the string "true"/"false" in the DOM, which is what assistive tech expects.',
            '`Tabs.Panel` returns `null` when `active !== value`. Returning hidden markup instead would leak content to screen readers.',
          ],
          solution: `import { createContext, useContext, useMemo, useState } from 'react';

const TabsContext = createContext(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<Tabs.*> must be used inside <Tabs>');
  return ctx;
}

export function Tabs({ defaultValue, children }) {
  const [active, setActive] = useState(defaultValue);
  // Stable unless the selection changes, so children do not re-render for free.
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

Tabs.List = function TabsList({ children }) {
  useTabs();
  return <div role="tablist">{children}</div>;
};

Tabs.Tab = function TabsTab({ value, children }) {
  const { active, setActive } = useTabs();
  const selected = active === value;
  return (
    <button role="tab" aria-selected={selected} onClick={() => setActive(value)}>
      {children}
    </button>
  );
};

Tabs.Panel = function TabsPanel({ value, children }) {
  const { active } = useTabs();
  if (active !== value) return null;
  return <div role="tabpanel">{children}</div>;
};
`,
          tests: `const Example = ({ defaultValue = 'a' }) => (
  <solution.Tabs defaultValue={defaultValue}>
    <solution.Tabs.List>
      <solution.Tabs.Tab value="a">First</solution.Tabs.Tab>
      <solution.Tabs.Tab value="b">Second</solution.Tabs.Tab>
      <solution.Tabs.Tab value="c">Third</solution.Tabs.Tab>
    </solution.Tabs.List>
    <solution.Tabs.Panel value="a">First panel</solution.Tabs.Panel>
    <solution.Tabs.Panel value="b">Second panel</solution.Tabs.Panel>
    <solution.Tabs.Panel value="c">Third panel</solution.Tabs.Panel>
  </solution.Tabs>
);

describe('Tabs', () => {
  it('renders a tablist with a tab per child', () => {
    render(<Example />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('shows only the default panel', () => {
    render(<Example />);
    expect(screen.getByText('First panel')).toBeTruthy();
    expect(screen.queryByText('Second panel')).toBeNull();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('honours defaultValue', () => {
    render(<Example defaultValue="c" />);
    expect(screen.getByText('Third panel')).toBeTruthy();
    expect(screen.queryByText('First panel')).toBeNull();
  });

  it('marks the active tab with aria-selected', () => {
    render(<Example />);
    const [first, second] = screen.getAllByRole('tab');
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('aria-selected')).toBe('false');
  });

  it('switches panels on click', () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByText('Second panel')).toBeTruthy();
    expect(screen.queryByText('First panel')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('false');
  });

  it('lets the consumer arrange the markup freely', () => {
    render(
      <solution.Tabs defaultValue="x">
        <header>
          <h1>Settings</h1>
          <solution.Tabs.List>
            <solution.Tabs.Tab value="x">X</solution.Tabs.Tab>
          </solution.Tabs.List>
        </header>
        <main>
          <solution.Tabs.Panel value="x">X content</solution.Tabs.Panel>
        </main>
      </solution.Tabs>,
    );
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('X content')).toBeTruthy();
  });

  it('throws a helpful error when used outside Tabs', () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => render(<solution.Tabs.Tab value="a">Orphan</solution.Tabs.Tab>))
        .toThrow('must be used inside <Tabs>');
      expect(() => render(<solution.Tabs.Panel value="a">Orphan</solution.Tabs.Panel>))
        .toThrow('must be used inside <Tabs>');
      expect(() => render(<solution.Tabs.List>Orphan</solution.Tabs.List>))
        .toThrow('must be used inside <Tabs>');
    } finally {
      console.error = quiet;
    }
  });
});`,
        },
        {
          id: 'react-render-props',
          title: 'Render props and children as a function',
          kind: 'react',
          xp: 80,
          why: 'Hooks replaced most render props, but the pattern is still how you share *rendering* rather than logic.',
          tags: ['composition', 'render props', 'children'],
          brief: `A render prop hands the consumer the state and lets them decide the markup.
It is the right tool when the wrapper owns behaviour but should not own
appearance — lists with empty states, virtualisation, drag handles.

## Task

Export:

- \`List({ items, children, empty })\` — calls \`children(item, index)\` for each
  item and wraps the results in a \`<ul>\` with \`<li>\` per item. When \`items\` is
  empty, render \`empty\` if given, otherwise \`<p>Nothing here</p>\`. Do not
  render a \`<ul>\` at all when empty.
- \`Toggle({ children, initial })\` — owns a boolean and calls
  \`children({ on, toggle })\`.
- \`Resource({ load, children })\` — loads on mount and calls
  \`children({ status, data, error })\` where status is
  \`'loading' | 'success' | 'error'\`.`,
          starter: `import { useState, useEffect, useCallback } from 'react';

export function List({ items, children, empty }) {
  // TODO
  return null;
}

export function Toggle({ children, initial = false }) {
  // TODO
  return null;
}

export function Resource({ load, children }) {
  // TODO
  return null;
}
`,
          hints: [
            'A render prop is called, not rendered: `{items.map((item, i) => <li key={i}>{children(item, i)}</li>)}`.',
            'Returning the consumer\'s render output directly is fine — `return children({ on, toggle })` — React accepts any valid element from a component.',
            'For `Resource`, reuse the cleanup pattern: an `active` flag flipped in the effect cleanup so a late response cannot set state.',
            'Give `List` a stable key when the item has an `id`, falling back to the index only when it does not.',
          ],
          solution: `import { useState, useEffect, useCallback } from 'react';

export function List({ items, children, empty }) {
  if (items.length === 0) return empty ?? <p>Nothing here</p>;
  return (
    <ul>
      {items.map((item, index) => (
        <li key={item?.id ?? index}>{children(item, index)}</li>
      ))}
    </ul>
  );
}

export function Toggle({ children, initial = false }) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((current) => !current), []);
  return children({ on, toggle });
}

export function Resource({ load, children }) {
  const [state, setState] = useState({ status: 'loading', data: undefined, error: undefined });

  useEffect(() => {
    let active = true;
    load().then(
      (data) => { if (active) setState({ status: 'success', data, error: undefined }); },
      (error) => { if (active) setState({ status: 'error', data: undefined, error }); },
    );
    return () => { active = false; };
  }, [load]);

  return children(state);
}
`,
          tests: `describe('List', () => {
  it('renders one li per item using the render prop', () => {
    render(
      <solution.List items={[{ id: 1, name: 'a' }, { id: 2, name: 'b' }]}>
        {(item) => <span>{item.name.toUpperCase()}</span>}
      </solution.List>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('B');
  });

  it('passes the index too', () => {
    render(
      <solution.List items={['x', 'y']}>
        {(item, index) => <span>{index}:{item}</span>}
      </solution.List>,
    );
    expect(screen.getByText('0:x')).toBeTruthy();
    expect(screen.getByText('1:y')).toBeTruthy();
  });

  it('renders the default empty state with no ul', () => {
    const { container } = render(<solution.List items={[]}>{(i) => i}</solution.List>);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders a custom empty state', () => {
    render(
      <solution.List items={[]} empty={<div>No results for your search</div>}>
        {(i) => i}
      </solution.List>,
    );
    expect(screen.getByText('No results for your search')).toBeTruthy();
    expect(screen.queryByText('Nothing here')).toBeNull();
  });
});

describe('Toggle', () => {
  it('hands state and a toggle to the consumer', () => {
    render(
      <solution.Toggle>
        {({ on, toggle }) => (
          <button onClick={toggle}>{on ? 'ON' : 'OFF'}</button>
        )}
      </solution.Toggle>,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('OFF');
    fireEvent.click(button);
    expect(button.textContent).toBe('ON');
    fireEvent.click(button);
    expect(button.textContent).toBe('OFF');
  });

  it('accepts an initial value', () => {
    render(<solution.Toggle initial>{({ on }) => <span>{String(on)}</span>}</solution.Toggle>);
    expect(screen.getByText('true')).toBeTruthy();
  });

  it('lets the consumer render anything', () => {
    render(
      <solution.Toggle>
        {({ on, toggle }) => (
          <div>
            <input type="checkbox" checked={on} onChange={toggle} aria-label="Enabled" />
            {on && <p>Extra options</p>}
          </div>
        )}
      </solution.Toggle>,
    );
    expect(screen.queryByText('Extra options')).toBeNull();
    fireEvent.click(screen.getByLabelText('Enabled'));
    expect(screen.getByText('Extra options')).toBeTruthy();
  });
});

describe('Resource', () => {
  it('reports loading, then success', async () => {
    const load = async () => ['a', 'b'];
    render(
      <solution.Resource load={load}>
        {({ status, data }) => (status === 'loading' ? <p>Loading</p> : <p>{data.join(',')}</p>)}
      </solution.Resource>,
    );
    expect(screen.getByText('Loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('a,b')).toBeTruthy());
  });

  it('reports errors', async () => {
    const load = async () => { throw new Error('nope'); };
    render(
      <solution.Resource load={load}>
        {({ status, error }) => <p>{status === 'error' ? 'failed: ' + error.message : status}</p>}
      </solution.Resource>,
    );
    await waitFor(() => expect(screen.getByText('failed: nope')).toBeTruthy());
  });

  it('composes with List for the whole loading-to-list flow', async () => {
    const load = async () => [{ id: 1, name: 'ada' }];
    render(
      <solution.Resource load={load}>
        {({ status, data }) =>
          status === 'success'
            ? <solution.List items={data}>{(u) => <span>{u.name}</span>}</solution.List>
            : <p>…</p>
        }
      </solution.Resource>,
    );
    await waitFor(() => expect(screen.getByText('ada')).toBeTruthy());
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});`,
        },
        {
          id: 'react-memo-renders',
          title: 'Renders you can account for',
          kind: 'react',
          xp: 90,
          why: 'Sprinkling memo everywhere is cargo cult. Knowing exactly why a component re-rendered is the skill.',
          tags: ['performance', 'memo', 'useCallback', 'useMemo'],
          brief: `\`React.memo\` compares props shallowly. It does nothing if you hand it a new
function or a new object literal every render — which is the default.

## Task

The starter re-renders \`ExpensiveRow\` every time the parent's unrelated
\`counter\` changes. Fix it so that:

- clicking **Bump** (unrelated state) does **not** re-render any row
- clicking a row's **Select** button re-renders only what must change
- editing the filter re-renders rows only when the visible set changes

Keep the \`renderLog\` array export and push to it exactly as the starter does —
that is how this is graded.

Rules: do not change \`ExpensiveRow\`'s props or the rendered output. You may
add \`memo\`, \`useCallback\` and \`useMemo\`.`,
          starter: `import { useState, memo, useCallback, useMemo } from 'react';

export const renderLog = [];

function ExpensiveRowImpl({ item, onSelect, selected }) {
  renderLog.push('row:' + item.id);
  return (
    <li>
      {item.name}{selected ? ' (selected)' : ''}
      <button onClick={() => onSelect(item.id)}>Select {item.name}</button>
    </li>
  );
}

// TODO: this is not memoised
export const ExpensiveRow = ExpensiveRowImpl;

export function Board({ items }) {
  renderLog.push('board');
  const [counter, setCounter] = useState(0);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');

  // TODO: a new function every render defeats memo
  const onSelect = (id) => setSelected(id);

  // TODO: a new array every render
  const visible = items.filter((item) => item.name.includes(filter));

  return (
    <div>
      <button onClick={() => setCounter((c) => c + 1)}>Bump {counter}</button>
      <label htmlFor="filter">Filter</label>
      <input id="filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul>
        {visible.map((item) => (
          <ExpensiveRow key={item.id} item={item} onSelect={onSelect} selected={selected === item.id} />
        ))}
      </ul>
    </div>
  );
}
`,
          hints: [
            'Wrap the row: `export const ExpensiveRow = memo(ExpensiveRowImpl);`. That alone is not enough — its props must also be stable.',
            '`const onSelect = useCallback((id) => setSelected(id), []);` — the setter from useState is stable, so the dependency list is empty.',
            '`const visible = useMemo(() => items.filter(...), [items, filter]);` keeps the array identity stable when neither input changed.',
            'The `selected` prop is a boolean, so it only changes for the two rows whose selection actually flipped — nothing extra needed there.',
            'Note what memo cannot fix: the parent itself still re-renders. Memo stops the work from cascading down, which is the point.',
          ],
          solution: `import { useState, memo, useCallback, useMemo } from 'react';

export const renderLog = [];

function ExpensiveRowImpl({ item, onSelect, selected }) {
  renderLog.push('row:' + item.id);
  return (
    <li>
      {item.name}{selected ? ' (selected)' : ''}
      <button onClick={() => onSelect(item.id)}>Select {item.name}</button>
    </li>
  );
}

// Shallow-compares props: worth it only because the props below are stable.
export const ExpensiveRow = memo(ExpensiveRowImpl);

export function Board({ items }) {
  renderLog.push('board');
  const [counter, setCounter] = useState(0);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');

  // Stable identity: the state setter never changes, so no dependencies.
  const onSelect = useCallback((id) => setSelected(id), []);

  const visible = useMemo(
    () => items.filter((item) => item.name.includes(filter)),
    [items, filter],
  );

  return (
    <div>
      <button onClick={() => setCounter((c) => c + 1)}>Bump {counter}</button>
      <label htmlFor="filter">Filter</label>
      <input id="filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul>
        {visible.map((item) => (
          <ExpensiveRow key={item.id} item={item} onSelect={onSelect} selected={selected === item.id} />
        ))}
      </ul>
    </div>
  );
}
`,
          tests: `const items = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
  { id: 3, name: 'gamma' },
];

const rowRenders = () => solution.renderLog.filter((e) => e.startsWith('row:'));
const reset = () => { solution.renderLog.length = 0; };

beforeEach(reset);

describe('Board renders', () => {
  it('renders every row once on mount', () => {
    render(<solution.Board items={items} />);
    expect(rowRenders()).toEqual(['row:1', 'row:2', 'row:3']);
  });

  it('does not re-render any row when unrelated state changes', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    expect(solution.renderLog).toContain('board');
    expect(rowRenders()).toEqual([]);
  });

  it('re-renders only the rows whose selection changed', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.click(screen.getByRole('button', { name: 'Select beta' }));
    // Only row 2 flipped from unselected to selected.
    expect(rowRenders()).toEqual(['row:2']);
    expect(screen.getAllByRole('listitem')[1].textContent).toContain('beta (selected)');
  });

  it('re-renders the two affected rows when selection moves', () => {
    render(<solution.Board items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select beta' }));
    reset();
    fireEvent.click(screen.getByRole('button', { name: 'Select gamma' }));
    expect(rowRenders().sort()).toEqual(['row:2', 'row:3']);
  });

  it('does not re-render surviving rows when the filter narrows', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'al' } });
    // Only alpha still matches, and its props are unchanged, so it must not re-render.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(rowRenders()).toEqual([]);
  });

  it('still filters correctly', () => {
    render(<solution.Board items={items} />);
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'bet' } });
    const shown = screen.getAllByRole('listitem');
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toContain('beta');
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: '' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps the bump counter working', () => {
    render(<solution.Board items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    expect(screen.getByRole('button', { name: 'Bump 1' })).toBeTruthy();
  });

  it('memoises the row component itself', () => {
    // A memo() component exposes its inner type; a plain function does not.
    expect(solution.ExpensiveRow.$$typeof).toBeDefined();
    expect(String(solution.ExpensiveRow.$$typeof)).toContain('memo');
  });
});`,
        },
        {
          id: 'react-keys-debug',
          title: 'Debug: keys and lost state',
          kind: 'react',
          xp: 75,
          why: 'Index keys are the bug that makes a form "randomly" swap the user\'s typing between rows.',
          tags: ['keys', 'reconciliation', 'debugging'],
          brief: `React matches old and new children by \`key\`. With \`key={index}\`, deleting
the first row tells React "row 0 kept its identity, its content just changed" —
so it keeps the DOM node, along with any state living inside it: input values,
focus, scroll position.

## Task

\`TodoEditor\` uses index keys and loses typed text when a row above is removed.
Fix it. The data already has stable \`id\`s.

Keep the structure: a labelled input per todo (label = the todo's title) and a
\`Delete <title>\` button.`,
          starter: `import { useState } from 'react';

export function TodoEditor({ todos: initial }) {
  const [todos, setTodos] = useState(initial);

  const remove = (id) => setTodos((current) => current.filter((t) => t.id !== id));

  return (
    <ul>
      {todos.map((todo, index) => (
        // BUG: the index is not this row's identity
        <li key={index}>
          <label htmlFor={'note-' + todo.id}>{todo.title}</label>
          <input id={'note-' + todo.id} defaultValue="" />
          <button onClick={() => remove(todo.id)}>Delete {todo.title}</button>
        </li>
      ))}
    </ul>
  );
}
`,
          hints: [
            'The fix is one word: `key={todo.id}`.',
            'A key must be stable (the same value across renders for the same item), unique among siblings, and derived from the data — never from the position.',
            'Index keys are only safe for a list that is append-only and never reordered, filtered, or stateful.',
          ],
          solution: `import { useState } from 'react';

export function TodoEditor({ todos: initial }) {
  const [todos, setTodos] = useState(initial);

  const remove = (id) => setTodos((current) => current.filter((t) => t.id !== id));

  return (
    <ul>
      {todos.map((todo) => (
        // The id is the row's identity, so React moves the DOM node with it.
        <li key={todo.id}>
          <label htmlFor={'note-' + todo.id}>{todo.title}</label>
          <input id={'note-' + todo.id} defaultValue="" />
          <button onClick={() => remove(todo.id)}>Delete {todo.title}</button>
        </li>
      ))}
    </ul>
  );
}
`,
          tests: `const todos = [
  { id: 'a', title: 'Buy milk' },
  { id: 'b', title: 'Write tests' },
  { id: 'c', title: 'Ship it' },
];

describe('TodoEditor', () => {
  it('renders an input per todo', () => {
    render(<solution.TodoEditor todos={todos} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByLabelText('Write tests')).toBeTruthy();
  });

  it('deletes the right row', () => {
    render(<solution.TodoEditor todos={todos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Write tests' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByLabelText('Write tests')).toBeNull();
    expect(screen.getByLabelText('Buy milk')).toBeTruthy();
    expect(screen.getByLabelText('Ship it')).toBeTruthy();
  });

  it('keeps typed text with its own row when an earlier row is deleted', () => {
    render(<solution.TodoEditor todos={todos} />);
    fireEvent.change(screen.getByLabelText('Write tests'), { target: { value: 'unit + integration' } });
    fireEvent.change(screen.getByLabelText('Ship it'), { target: { value: 'friday' } });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Buy milk' }));

    // With index keys the values shift up by one row; with stable keys they follow their todo.
    expect(screen.getByLabelText('Write tests').value).toBe('unit + integration');
    expect(screen.getByLabelText('Ship it').value).toBe('friday');
  });

  it('keeps focus on the right row after a deletion', () => {
    render(<solution.TodoEditor todos={todos} />);
    const shipIt = screen.getByLabelText('Ship it');
    shipIt.focus();
    expect(document.activeElement).toBe(shipIt);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Buy milk' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Ship it'));
  });

  it('survives deleting from the middle', () => {
    render(<solution.TodoEditor todos={todos} />);
    fireEvent.change(screen.getByLabelText('Ship it'), { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Write tests' }));
    expect(screen.getByLabelText('Ship it').value).toBe('keep me');
  });

  it('does not key by index', () => {
    expect(solution.TodoEditor.toString()).not.toContain('key={index}');
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
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
          brief: `An optimistic update shows the result before the server confirms it. The
part people skip is the unhappy path: if the request fails you must put the old
value back **and** say so.

## Task

Export \`LikeButton({ initialLikes, initialLiked, save })\` where
\`save(nextLiked)\` resolves on success and rejects on failure.

- The button's accessible name is \`Like\` or \`Unlike\` depending on state
- It renders the count in a \`<span data-testid="count">\`
- Clicking updates the count and label **immediately**, then calls \`save\`
- On rejection, restore the previous count and label, and render
  \`Could not save. Try again.\`
- While a save is in flight the button is disabled (no double-fire)
- A successful save after a failure clears the error message`,
          starter: `import { useState } from 'react';

export function LikeButton({ initialLikes, initialLiked, save }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialLiked);

  // TODO: optimistic update, disable while saving, roll back on failure
  return null;
}
`,
          hints: [
            'Capture the previous values *before* you change them: `const prevLiked = liked; const prevLikes = likes;` — then restore those exact values in the catch block.',
            'Set the new state first, then `await save(next)` inside a try/catch. That ordering is what makes it optimistic.',
            'Track `const [saving, setSaving] = useState(false)` and clear it in a `finally` so a rejection cannot leave the button stuck.',
            'Clear the error at the start of each attempt so a later success removes the message.',
          ],
          solution: `import { useState } from 'react';

export function LikeButton({ initialLikes, initialLiked, save }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialLiked);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const click = async () => {
    const prevLiked = liked;
    const prevLikes = likes;
    const next = !liked;

    // Optimistic: paint the new state before the server agrees.
    setLiked(next);
    setLikes(prevLikes + (next ? 1 : -1));
    setFailed(false);
    setSaving(true);

    try {
      await save(next);
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button onClick={click} disabled={saving}>{liked ? 'Unlike' : 'Like'}</button>
      <span data-testid="count">{likes}</span>
      {failed && <p role="alert">Could not save. Try again.</p>}
    </div>
  );
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const count = () => screen.getByTestId('count').textContent;

describe('LikeButton', () => {
  it('renders the initial state', () => {
    render(<solution.LikeButton initialLikes={10} initialLiked={false} save={async () => {}} />);
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
    expect(count()).toBe('10');
  });

  it('renders the liked state', () => {
    render(<solution.LikeButton initialLikes={10} initialLiked save={async () => {}} />);
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
  });

  it('updates immediately, before the save resolves', async () => {
    const pending = deferred();
    render(<solution.LikeButton initialLikes={10} initialLiked={false} save={() => pending.promise} />);
    fireEvent.click(screen.getByRole('button'));
    // No await: the UI must already show the new value.
    expect(count()).toBe('11');
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
    await act(async () => { pending.resolve(); });
  });

  it('keeps the change when the save succeeds', async () => {
    render(<solution.LikeButton initialLikes={3} initialLiked={false} save={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('4');
    expect(screen.queryByText('Could not save. Try again.')).toBeNull();
  });

  it('decrements when unliking', async () => {
    render(<solution.LikeButton initialLikes={3} initialLiked save={async () => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('2');
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
  });

  it('rolls back and reports when the save fails', async () => {
    render(
      <solution.LikeButton
        initialLikes={7}
        initialLiked={false}
        save={async () => { throw new Error('500'); }}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('7');
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy();
    expect(screen.getByText('Could not save. Try again.')).toBeTruthy();
  });

  it('rolls back an unlike too', async () => {
    render(
      <solution.LikeButton
        initialLikes={7}
        initialLiked
        save={async () => { throw new Error('500'); }}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('7');
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
  });

  it('disables the button while saving, then re-enables it', async () => {
    const pending = deferred();
    render(<solution.LikeButton initialLikes={1} initialLiked={false} save={() => pending.promise} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    await act(async () => { pending.resolve(); });
    expect(screen.getByRole('button').disabled).toBe(false);
  });

  it('does not double-fire when clicked twice quickly', async () => {
    let calls = 0;
    const pending = deferred();
    render(
      <solution.LikeButton
        initialLikes={1}
        initialLiked={false}
        save={() => { calls++; return pending.promise; }}
      />,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toBe(1);
    await act(async () => { pending.resolve(); });
  });

  it('re-enables after a failure so the user can retry', async () => {
    let attempt = 0;
    const save = async () => {
      attempt++;
      if (attempt === 1) throw new Error('flaky');
    };
    render(<solution.LikeButton initialLikes={5} initialLiked={false} save={save} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(screen.getByText('Could not save. Try again.')).toBeTruthy();
    expect(screen.getByRole('button').disabled).toBe(false);

    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(count()).toBe('6');
    expect(screen.queryByText('Could not save. Try again.')).toBeNull();
  });

  it('passes the intended next value to save', async () => {
    const seen = [];
    render(
      <solution.LikeButton
        initialLikes={0}
        initialLiked={false}
        save={async (next) => { seen.push(next); }}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(seen).toEqual([true, false]);
  });
});`,
        },
        {
          id: 'react-a11y-modal',
          title: 'An accessible dialog',
          kind: 'react',
          xp: 95,
          why: 'Modals are where accessibility gets skipped. Doing one right is a portfolio-grade detail.',
          tags: ['accessibility', 'focus management', 'events'],
          brief: `A \`<div className="modal">\` is not a dialog. Keyboard users cannot escape
it, screen readers do not announce it, and focus is left wherever it was.

## Task

Export \`Modal({ open, onClose, title, children })\`:

- renders nothing when \`open\` is false
- when open, renders a \`<div role="dialog">\` with \`aria-modal="true"\` and
  \`aria-labelledby\` pointing at the \`<h2>\` that holds \`title\`
- a \`Close\` button calls \`onClose\`
- pressing **Escape** anywhere calls \`onClose\`
- on open, focus moves to the dialog
- on close, focus returns to whatever was focused before it opened

Clean up the key listener when the modal closes or unmounts.`,
          starter: `import { useEffect, useRef, useId } from 'react';

export function Modal({ open, onClose, title, children }) {
  // TODO
  return null;
}
`,
          hints: [
            '`useId()` gives you a stable unique id for the heading, which `aria-labelledby` references.',
            'Attach the key handler in an effect that depends on `[open, onClose]`, and return `() => document.removeEventListener("keydown", handler)`.',
            'Save the previously focused element before moving focus: `const previous = document.activeElement;` in the effect, then `previous?.focus()` in the cleanup.',
            'To focus a div, it needs to be focusable: give the dialog `tabIndex={-1}` and call `ref.current.focus()`.',
          ],
          solution: `import { useEffect, useRef, useId } from 'react';

export function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Send focus back where the user left it.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={dialogRef}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
`,
          tests: `const Harness = ({ startOpen = false }) => {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open settings</button>
      <solution.Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <p>Body content</p>
      </solution.Modal>
    </div>
  );
};

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<solution.Modal open={false} onClose={() => {}} title="Settings">body</solution.Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('body')).toBeNull();
  });

  it('renders a labelled modal dialog when open', () => {
    render(<solution.Modal open onClose={() => {}} title="Settings"><p>Body content</p></solution.Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Body content')).toBeTruthy();

    // aria-labelledby must actually point at the heading holding the title.
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const heading = document.getElementById(labelId);
    expect(heading).toBeTruthy();
    expect(heading.textContent).toBe('Settings');
    expect(heading.tagName).toBe('H2');
  });

  it('is findable by its accessible name', () => {
    render(<solution.Modal open onClose={() => {}} title="Settings">x</solution.Modal>);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
  });

  it('closes via the Close button', () => {
    let closed = 0;
    render(<solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(1);
  });

  it('closes on Escape', () => {
    let closed = 0;
    render(<solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(1);
  });

  it('ignores other keys', () => {
    let closed = 0;
    render(<solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(closed).toBe(0);
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement === dialog || dialog.contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the trigger when it closes', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(trigger);
  });

  it('removes its key listener when closed', () => {
    let closed = 0;
    const { rerender } = render(
      <solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>,
    );
    rerender(<solution.Modal open={false} onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(0);
  });

  it('removes its key listener on unmount', () => {
    let closed = 0;
    const { unmount } = render(
      <solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>,
    );
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(0);
  });
});`,
        },
        {
          id: 'react-data-table',
          title: 'BOSS: sortable, filterable, paginated table',
          kind: 'react',
          xp: 240,
          boss: true,
          why: 'The single most requested feature in internal tooling, and a genuine test of state design.',
          tags: ['state design', 'useMemo', 'accessibility', 'composition'],
          brief: `The chapter's boss: one component, four interacting pieces of state, and a
derived pipeline that must stay in the right order.

## Task

Export \`DataTable({ rows, columns, pageSize = 3 })\`.
\`columns\` is \`[{ key, label, sortable }]\`.

**Structure**

- a \`<table>\` with a \`<th>\` per column. Sortable columns' headers are
  \`<button>\`s labelled with the column label.
- \`aria-sort\` on the sorted \`<th>\`: \`'ascending'\` or \`'descending'\`; absent
  on the others.
- a search box labelled \`Search\`
- \`<tbody>\` holds only the current page's rows
- a status line \`\`\`\`Showing 1–3 of 7\`\`\`\` (en dash) in an element with
  \`role="status"\`
- \`Previous\` and \`Next\` buttons, disabled at the ends

**Behaviour**

1. Search filters across **all** column values, case-insensitively.
2. Clicking a sortable header sorts ascending; clicking the same one again
   flips to descending. Sorting by a new column starts ascending again.
3. Strings sort with \`localeCompare\`; numbers sort numerically.
4. The pipeline order is filter → sort → paginate.
5. Changing the search resets to page 1. So does changing the sort.
6. With no matching rows: no \`<tbody>\` rows, and \`No results\` shown.

Derive everything you can; only \`search\`, \`sort\` and \`page\` are state.`,
          starter: `import { useState, useMemo } from 'react';

export function DataTable({ rows, columns, pageSize = 3 }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [page, setPage] = useState(1);

  // TODO: filter -> sort -> paginate, all derived
  return null;
}
`,
          hints: [
            'Filter by joining every value: `columns.some((c) => String(row[c.key]).toLowerCase().includes(needle))`.',
            'Sort on a copy — `[...filtered].sort(...)` — because `Array.prototype.sort` mutates, and mutating the memoised filter result would corrupt it.',
            'Compare by type: `typeof a === "number" ? a - b : String(a).localeCompare(String(b))`, then negate the result when the direction is descending.',
            'Slice for the page: `const start = (page - 1) * pageSize;` then `sorted.slice(start, start + pageSize)`.',
            'To "reset to page 1", set page inside the same handler that changes search or sort — do not use an effect to sync it, that renders a stale page first.',
            'Clamp the page when the filter shrinks the results: `const totalPages = Math.max(1, Math.ceil(count / pageSize))` and use `Math.min(page, totalPages)` when slicing.',
          ],
          solution: `import { useState, useMemo } from 'react';

export function DataTable({ rows, columns, pageSize = 3 }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, columns, search]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    // Copy first: sort() mutates, and \`filtered\` may be the caller's array.
    const copy = [...filtered];
    copy.sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      const order = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b));
      return sort.direction === 'asc' ? order : -order;
    });
    return copy;
  }, [filtered, sort]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleSort = (key) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
    setPage(1);
  };

  const onSearch = (event) => {
    setSearch(event.target.value);
    setPage(1);
  };

  return (
    <div>
      <label htmlFor="table-search">Search</label>
      <input id="table-search" value={search} onChange={onSearch} />

      <table>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable
                    ? <button onClick={() => toggleSort(column.key)}>{column.label}</button>
                    : column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={column.key}>{String(row[column.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      {total === 0 && <p>No results</p>}

      <p role="status">
        {total === 0
          ? 'Showing 0 of 0'
          : 'Showing ' + (start + 1) + '–' + Math.min(start + pageSize, total) + ' of ' + total}
      </p>

      <button onClick={() => setPage((p) => p - 1)} disabled={currentPage <= 1}>Previous</button>
      <button onClick={() => setPage((p) => p + 1)} disabled={currentPage >= totalPages}>Next</button>
    </div>
  );
}
`,
          tests: `const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'score', label: 'Score', sortable: true },
  { key: 'team', label: 'Team', sortable: false },
];

const rows = [
  { id: 1, name: 'ada', score: 90, team: 'core' },
  { id: 2, name: 'bob', score: 70, team: 'growth' },
  { id: 3, name: 'cy', score: 85, team: 'core' },
  { id: 4, name: 'dee', score: 60, team: 'growth' },
  { id: 5, name: 'eve', score: 100, team: 'core' },
  { id: 6, name: 'fay', score: 75, team: 'platform' },
  { id: 7, name: 'gus', score: 65, team: 'platform' },
];

const table = () => render(<solution.DataTable rows={rows} columns={columns} />);
const names = () =>
  screen.getAllByRole('row').slice(1).map((tr) => tr.querySelectorAll('td')[0].textContent);
const status = () => screen.getByRole('status').textContent;
const search = (value) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('structure', () => {
  it('renders a header per column', () => {
    table();
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Score', 'Team']);
  });

  it('makes sortable headers buttons and leaves others alone', () => {
    table();
    expect(screen.getByRole('button', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Score' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Team' })).toBeNull();
  });

  it('shows one page of rows', () => {
    table();
    expect(names()).toEqual(['ada', 'bob', 'cy']);
    expect(status()).toBe('Showing 1–3 of 7');
  });

  it('respects a custom pageSize', () => {
    render(<solution.DataTable rows={rows} columns={columns} pageSize={2} />);
    expect(names()).toHaveLength(2);
    expect(status()).toBe('Showing 1–2 of 7');
  });
});

describe('pagination', () => {
  it('walks forward and back', () => {
    table();
    click('Next');
    expect(names()).toEqual(['dee', 'eve', 'fay']);
    expect(status()).toBe('Showing 4–6 of 7');
    click('Next');
    expect(names()).toEqual(['gus']);
    expect(status()).toBe('Showing 7–7 of 7');
    click('Previous');
    expect(names()).toEqual(['dee', 'eve', 'fay']);
  });

  it('disables Previous on the first page and Next on the last', () => {
    table();
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false);
    click('Next');
    click('Next');
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(false);
  });
});

describe('search', () => {
  it('filters across every column', () => {
    table();
    search('growth');
    expect(names()).toEqual(['bob', 'dee']);
    expect(status()).toBe('Showing 1–2 of 2');
  });

  it('is case-insensitive', () => {
    table();
    search('ADA');
    expect(names()).toEqual(['ada']);
  });

  it('matches numeric columns', () => {
    table();
    search('100');
    expect(names()).toEqual(['eve']);
  });

  it('shows an empty state with no rows', () => {
    table();
    search('nobody');
    expect(names()).toEqual([]);
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('resets to page 1', () => {
    table();
    click('Next');
    expect(status()).toBe('Showing 4–6 of 7');
    search('core');
    expect(status()).toBe('Showing 1–3 of 3');
    expect(names()).toEqual(['ada', 'cy', 'eve']);
  });

  it('recovers when the search is cleared', () => {
    table();
    search('core');
    search('');
    expect(names()).toEqual(['ada', 'bob', 'cy']);
    expect(status()).toBe('Showing 1–3 of 7');
  });
});

describe('sorting', () => {
  it('sorts ascending on first click', () => {
    table();
    click('Score');
    expect(names()).toEqual(['dee', 'gus', 'bob']);
  });

  it('flips to descending on a second click', () => {
    table();
    click('Score');
    click('Score');
    expect(names()).toEqual(['eve', 'ada', 'cy']);
  });

  it('sorts numbers numerically, not as strings', () => {
    const numeric = [
      { id: 1, name: 'a', score: 9, team: 'x' },
      { id: 2, name: 'b', score: 100, team: 'x' },
      { id: 3, name: 'c', score: 20, team: 'x' },
    ];
    render(<solution.DataTable rows={numeric} columns={columns} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score' }));
    expect(names()).toEqual(['a', 'c', 'b']);
  });

  it('sorts strings alphabetically', () => {
    table();
    click('Name');
    click('Name');
    expect(names()).toEqual(['gus', 'fay', 'eve']);
  });

  it('starts a new column ascending', () => {
    table();
    click('Score');
    click('Score');
    click('Name');
    expect(names()).toEqual(['ada', 'bob', 'cy']);
  });

  it('reports direction with aria-sort', () => {
    table();
    const headers = () => screen.getAllByRole('columnheader');
    expect(headers().map((h) => h.getAttribute('aria-sort'))).toEqual([null, null, null]);
    click('Score');
    expect(headers()[1].getAttribute('aria-sort')).toBe('ascending');
    expect(headers()[0].getAttribute('aria-sort')).toBe(null);
    click('Score');
    expect(headers()[1].getAttribute('aria-sort')).toBe('descending');
    click('Name');
    expect(headers()[0].getAttribute('aria-sort')).toBe('ascending');
    expect(headers()[1].getAttribute('aria-sort')).toBe(null);
  });

  it('resets to page 1 when the sort changes', () => {
    table();
    click('Next');
    click('Score');
    expect(status()).toBe('Showing 1–3 of 7');
  });
});

describe('the pipeline runs filter -> sort -> paginate', () => {
  it('sorts only the filtered rows', () => {
    table();
    search('core');
    click('Score');
    expect(names()).toEqual(['cy', 'ada', 'eve']);
    expect(status()).toBe('Showing 1–3 of 3');
  });

  it('paginates the sorted, filtered set', () => {
    render(<solution.DataTable rows={rows} columns={columns} pageSize={2} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'o' } });
    // matches: bob (growth), cy (core), ada (core), dee (growth), eve (core)
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(names()).toEqual(['ada', 'bob']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(names()).toEqual(['cy', 'dee']);
  });

  it('never mutates the rows it was given', () => {
    const original = rows.map((r) => r.name);
    table();
    click('Score');
    click('Score');
    click('Name');
    expect(rows.map((r) => r.name)).toEqual(original);
  });
});`,
        },
      ],
    },
  ],
});
