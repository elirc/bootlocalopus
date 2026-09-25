import { useId, useState } from 'react';

// TODO: keep the text the user is editing separately from the cents, parse
// without floating-point error, and format for display on blur.
export function MoneyInput({ label, valueCents, onChange }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={valueCents === null ? 0 : valueCents / 100}
        onChange={(e) => onChange(Math.floor(parseFloat(e.target.value) * 100))}
      />
    </div>
  );
}
