import { useId } from 'react';

export function TextField({ label, hint, error, id, ...inputProps }) {
  // useId is derived from the component's place in the tree, so the server
  // and the browser agree on it. Never call it conditionally: take the
  // caller's id *after* calling the hook.
  const base = useId();
  const inputId = id ?? base;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;

  // `undefined` makes React omit the attribute entirely.
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input
        {...inputProps}
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
      {hint && <p id={hintId}>{hint}</p>}
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
