// Same behaviour: a reducer, labels in wrappers, <span> errors with other ids and classes.
import { useReducer, useRef } from 'react';

const rules = {
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) ? null : 'Enter a valid email address'),
  password: (v) => (v.password.length >= 8 ? null : 'Password must be at least 8 characters'),
  terms: (v) => (v.terms ? null : 'You must accept the terms'),
};
const names = Object.keys(rules);

function reducer(state, action) {
  switch (action.type) {
    case 'change': {
      const values = { ...state.values, [action.name]: action.value };
      const errors = state.errors[action.name] ? { ...state.errors, [action.name]: rules[action.name](values) } : state.errors;
      return { ...state, values, errors };
    }
    case 'errors': return { ...state, errors: action.errors };
    case 'start': return { ...state, busy: true, failure: null };
    case 'fail': return { ...state, busy: false, failure: action.message };
    case 'done': return { ...state, busy: false };
    default: return state;
  }
}

let counter = 0;

export function SignupForm({ onSubmit }) {
  const [state, dispatch] = useReducer(reducer, { values: { email: '', password: '', terms: false }, errors: {}, busy: false, failure: null });
  const inputs = useRef({});
  const prefix = useRef(`signup${++counter}`).current;

  async function handleSubmit(e) {
    e.preventDefault();
    if (state.busy) return;
    const errors = {};
    for (const n of names) {
      const message = rules[n](state.values);
      if (message) errors[n] = message;
    }
    dispatch({ type: 'errors', errors });
    const first = names.find((n) => errors[n]);
    if (first) return inputs.current[first].focus();
    dispatch({ type: 'start' });
    try {
      await onSubmit({ password: state.values.password, email: state.values.email.trim() });
      dispatch({ type: 'done' });
    } catch (err) {
      dispatch({ type: 'fail', message: err.message });
    }
  }

  const a11y = (n) => (state.errors[n]
    ? { 'aria-invalid': true, 'aria-describedby': `${prefix}_${n}_msg` }
    : {});
  const message = (n) => (state.errors[n] ? <span className="field-msg" id={`${prefix}_${n}_msg`}>{state.errors[n]}</span> : null);
  const set = (n, value) => dispatch({ type: 'change', name: n, value });

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div>
        <label htmlFor={`${prefix}_email`}>Email</label>
        <input id={`${prefix}_email`} ref={(el) => { inputs.current.email = el; }} type="text" inputMode="email" value={state.values.email} onChange={(e) => set('email', e.target.value)} {...a11y('email')} />
        {message('email')}
      </div>
      <div>
        <label htmlFor={`${prefix}_password`}>Password</label>
        <input id={`${prefix}_password`} ref={(el) => { inputs.current.password = el; }} type="password" value={state.values.password} onChange={(e) => set('password', e.target.value)} {...a11y('password')} />
        {message('password')}
      </div>
      <div>
        <input id={`${prefix}_terms`} ref={(el) => { inputs.current.terms = el; }} type="checkbox" checked={state.values.terms} onChange={(e) => set('terms', e.target.checked)} {...a11y('terms')} />
        <label htmlFor={`${prefix}_terms`}>I accept the terms</label>
        {message('terms')}
      </div>
      {state.failure ? <div role="alert">{state.failure}</div> : null}
      <button disabled={state.busy}>{state.busy ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}
