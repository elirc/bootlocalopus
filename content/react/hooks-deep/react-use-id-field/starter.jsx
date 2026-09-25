import { useId } from 'react';

export function TextField({ label, hint, error, id, ...inputProps }) {
  // TODO: generate ids with useId and wire up htmlFor / aria-describedby
  return (
    <div>
      <label>{label}</label>
      <input {...inputProps} />
    </div>
  );
}
