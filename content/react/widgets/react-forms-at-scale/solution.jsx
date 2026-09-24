import { useState, useRef, useId, useEffect } from 'react';

const hasMessage = (message) => typeof message === 'string' ? message !== '' : message != null;

export function useForm({ initialValues, validate, onSubmit }) {
  const formId = useId();
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // The fields are the keys of initialValues; their elements come from refs.
  const names = Object.keys(initialValues);
  const elements = useRef(new Map());
  const refCallbacks = useRef(new Map());

  // `submitting` state is not visible until the next render, so two submit
  // events in the same tick would both see `false`. A ref is synchronous.
  const inFlight = useRef(false);

  // Callers pass `onSubmit` inline; hold the latest in a ref rather than
  // making anything depend on its identity.
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Derived, not stored: the shown errors are a function of values, touched
  // and whatever the server said. Nothing to keep in sync.
  const clientErrors = validate(values) ?? {};
  const errors = {};
  for (const name of names) {
    const client = touched[name] ? clientErrors[name] : undefined;
    const message = hasMessage(client) ? client : serverErrors[name];
    if (hasMessage(message)) errors[name] = message;
  }

  const inputId = (name) => `${formId}-${name}`;
  const errorId = (name) => `${formId}-${name}-error`;

  const focusFirst = (fieldNames) => {
    const first = fieldNames
      .map((name) => elements.current.get(name))
      .filter(Boolean)
      // Document order, not key order: the layout decides what "first" means.
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
    first?.focus();
  };

  // One stable callback ref per field, so React does not detach and
  // re-attach every ref on every render.
  const refFor = (name) => {
    let callback = refCallbacks.current.get(name);
    if (!callback) {
      callback = (element) => {
        if (element) elements.current.set(name, element);
        else elements.current.delete(name);
      };
      refCallbacks.current.set(name, callback);
    }
    return callback;
  };

  const register = (name) => {
    const invalid = name in errors;
    return {
      id: inputId(name),
      name,
      value: values[name],
      ref: refFor(name),
      'aria-invalid': invalid ? 'true' : undefined,
      'aria-describedby': invalid ? errorId(name) : undefined,
      onChange: (event) => {
        const { value } = event.target;
        setValues((current) => ({ ...current, [name]: value }));
        // The server judged the old value; an edit makes that verdict stale.
        setServerErrors((current) => {
          if (!(name in current)) return current;
          const { [name]: _stale, ...rest } = current;
          return rest;
        });
      },
      onBlur: () => {
        setTouched((current) => (current[name] ? current : { ...current, [name]: true }));
      },
    };
  };

  const errorProps = (name) => ({ id: errorId(name) });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;

    setFormError(null);
    setTouched(Object.fromEntries(names.map((name) => [name, true])));
    const invalid = names.filter((name) => hasMessage(clientErrors[name]));
    if (invalid.length) {
      focusFirst(invalid);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setServerErrors({});
    try {
      await onSubmitRef.current(values);
    } catch (error) {
      if (!mounted.current) return;
      const details = error && typeof error.details === 'object' && error.details !== null ? error.details : {};
      const mapped = Object.fromEntries(
        Object.entries(details).filter(([name, message]) => names.includes(name) && hasMessage(message)),
      );
      if (Object.keys(mapped).length) {
        setServerErrors(mapped);
        focusFirst(Object.keys(mapped));
      } else {
        setFormError(error?.message || 'Something went wrong');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  return { values, errors, submitting, formError, register, errorProps, handleSubmit };
}
