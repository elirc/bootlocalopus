import { useId, useRef, useState } from 'react';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ email, password, terms }) {
  const errors = {};
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (!terms) errors.terms = 'You must accept the terms';
  return errors;
}

const ORDER = ['email', 'password', 'terms'];

export function SignupForm({ onSubmit }) {
  const [values, setValues] = useState({ email: '', password: '', terms: false });
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState(null);
  const refs = { email: useRef(null), password: useRef(null), terms: useRef(null) };
  const id = useId();

  const change = (name, value) => {
    const next = { ...values, [name]: value };
    setValues(next);
    // Once a field has shown an error, re-check it as the user fixes it.
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: validate(next)[name] }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    const found = validate(values);
    setErrors(found);
    const firstInvalid = ORDER.find((name) => found[name]);
    if (firstInvalid) {
      refs[firstInvalid].current.focus();
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      await onSubmit({ email: values.email.trim(), password: values.password });
    } catch (error) {
      setServerError(error.message);
    } finally {
      setPending(false);
    }
  };

  const field = (name) => ({
    id: `${id}-${name}`,
    ref: refs[name],
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined,
  });
  const errorFor = (name) => errors[name] && <p id={`${id}-${name}-error`} className="error">{errors[name]}</p>;

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={`${id}-email`}>Email</label>
      <input type="text" inputMode="email" autoComplete="email" {...field('email')} value={values.email} onChange={(e) => change('email', e.target.value)} />
      {errorFor('email')}

      <label htmlFor={`${id}-password`}>Password</label>
      <input type="password" {...field('password')} value={values.password} onChange={(e) => change('password', e.target.value)} />
      {errorFor('password')}

      <input type="checkbox" {...field('terms')} checked={values.terms} onChange={(e) => change('terms', e.target.checked)} />
      <label htmlFor={`${id}-terms`}>I accept the terms</label>
      {errorFor('terms')}

      {serverError && <p role="alert">{serverError}</p>}
      <button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}
