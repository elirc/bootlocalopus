import { useEffect, useId, useRef, useState } from 'react';

const STEPS = [
  { title: 'Contact', fields: ['email'] },
  { title: 'Shipping', fields: ['address', 'city'] },
  { title: 'Review', fields: [] },
];

const LABELS = { email: 'Email', address: 'Address', city: 'City' };

const RULES = {
  email: (v) => (/^[^\s@]+@[^\s@]+$/.test(v) ? null : 'Enter a valid email'),
  address: (v) => (v ? null : 'Enter an address'),
  city: (v) => (v ? null : 'Enter a city'),
};

const trimmed = (values) => ({
  email: values.email.trim(),
  address: values.address.trim(),
  city: values.city.trim(),
});

// Module level: a component declared inside CheckoutWizard would be a new
// type on every render, and its input would lose focus on every keystroke.
function Field({ id, label, value, error, onChange, inputRef }) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <p id={errorId}>{error}</p>}
    </div>
  );
}

export function CheckoutWizard({ onSubmit }) {
  // Every step's values live here, above the steps, so they survive a step
  // unmounting when the user moves on or goes back.
  const [values, setValues] = useState({ email: '', address: '', city: '' });
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [failed, setFailed] = useState(false);

  const id = useId();
  const headingRef = useRef(null);
  const inputs = useRef({});
  const shownStep = useRef(step);

  // Focus the heading when the step changes, and not on the first render.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  const goTo = (next) => {
    setErrors({});
    setFailed(false);
    setStep(next);
  };

  const change = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!(name in current)) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  };

  const placeOrder = async () => {
    if (placing) return;
    setPlacing(true);
    setFailed(false);
    try {
      await onSubmit(trimmed(values));
    } catch {
      setFailed(true);
    } finally {
      setPlacing(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (step === STEPS.length - 1) {
      placeOrder();
      return;
    }
    // Only this step's fields: later steps have not been filled in yet.
    const clean = trimmed(values);
    const found = {};
    for (const name of STEPS[step].fields) {
      const message = RULES[name](clean[name]);
      if (message) found[name] = message;
    }
    const firstInvalid = STEPS[step].fields.find((name) => found[name]);
    if (firstInvalid) {
      setErrors(found);
      inputs.current[firstInvalid]?.focus();
      return;
    }
    goTo(step + 1);
  };

  const field = (name) => (
    <Field
      key={name}
      id={`${id}-${name}`}
      label={LABELS[name]}
      value={values[name]}
      error={errors[name]}
      onChange={(value) => change(name, value)}
      inputRef={(el) => { inputs.current[name] = el; }}
    />
  );

  const review = trimmed(values);

  return (
    <form onSubmit={submit} noValidate>
      <ol aria-label="Progress">
        {STEPS.map((s, index) => (
          <li key={s.title} aria-current={index === step ? 'step' : undefined}>
            {s.title}
          </li>
        ))}
      </ol>
      <h2 ref={headingRef} tabIndex={-1}>
        Step {step + 1} of {STEPS.length}: {STEPS[step].title}
      </h2>

      {STEPS[step].fields.map(field)}

      {step === 2 && (
        <>
          <dl>
            <dt>Email</dt>
            <dd>{review.email}</dd>
            <dt>Address</dt>
            <dd>{review.address}</dd>
            <dt>City</dt>
            <dd>{review.city}</dd>
          </dl>
          <button type="button" onClick={() => goTo(0)}>Edit contact</button>
          <button type="button" onClick={() => goTo(1)}>Edit shipping</button>
          {failed && <p role="alert">Could not place the order. Try again.</p>}
        </>
      )}

      {step > 0 && (
        <button type="button" onClick={() => goTo(step - 1)}>
          Back
        </button>
      )}
      {step < 2 ? (
        <button type="submit">Next</button>
      ) : (
        <button type="submit" disabled={placing}>Place order</button>
      )}
    </form>
  );
}
