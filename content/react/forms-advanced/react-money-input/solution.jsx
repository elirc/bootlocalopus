import { useId, useState } from 'react';

const INVALID = { ok: false };

/** Text -> { ok: true, cents } (cents may be null for empty) or { ok: false }. */
function parseAmount(text) {
  const clean = text.trim().replace(/,/g, '');
  if (clean === '') return { ok: true, cents: null };
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match || !/\d/.test(clean)) return INVALID;
  // Whole units and cents are separate integers: no floating point involved,
  // so 1.15 is 115, not 114.99999999999999.
  const units = Number(match[1] || '0');
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  return { ok: true, cents: units * 100 + cents };
}

function formatAmount(cents, { separators }) {
  if (cents === null || cents === undefined) return '';
  const units = Math.floor(cents / 100);
  const whole = separators ? units.toLocaleString('en-US') : String(units);
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

const forDisplay = (cents) => formatAmount(cents, { separators: true });
const forEditing = (cents) => formatAmount(cents, { separators: false });

export function MoneyInput({ label, valueCents, onChange }) {
  const id = useId();
  const errorId = `${id}-error`;
  const [text, setText] = useState(() => forDisplay(valueCents));
  const [focused, setFocused] = useState(false);
  // The last valueCents we saw, to notice changes that come from outside.
  const [seen, setSeen] = useState(valueCents);

  const parsed = parseAmount(text);

  // Adjusting state while rendering (React's documented alternative to an
  // effect for this): when the parent's value changes to something the text
  // does not already say, the parent wins.
  if (valueCents !== seen) {
    setSeen(valueCents);
    if (!(parsed.ok && parsed.cents === valueCents)) {
      setText(focused ? forEditing(valueCents) : forDisplay(valueCents));
    }
  }

  const change = (event) => {
    const next = event.target.value;
    setText(next);
    const result = parseAmount(next);
    if (result.ok && result.cents !== valueCents) onChange(result.cents);
  };

  const focus = () => {
    setFocused(true);
    if (parsed.ok) setText(forEditing(parsed.cents));
  };

  const blur = () => {
    setFocused(false);
    if (parsed.ok) setText(forDisplay(parsed.cents));
  };

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={change}
        onFocus={focus}
        onBlur={blur}
        aria-invalid={parsed.ok ? undefined : 'true'}
        aria-describedby={parsed.ok ? undefined : errorId}
      />
      {!parsed.ok && <p id={errorId}>Enter an amount like 12.50</p>}
    </div>
  );
}
