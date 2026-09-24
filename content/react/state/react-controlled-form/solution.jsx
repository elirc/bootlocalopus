import { useState } from 'react';

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
