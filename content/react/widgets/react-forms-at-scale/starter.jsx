import { useState, useRef, useId } from 'react';

export function useForm({ initialValues, validate, onSubmit }) {
  const [values, setValues] = useState(initialValues);

  // TODO: touched fields, shown errors, server errors, submitting, formError,
  // focus management, aria wiring.
  const register = (name) => ({
    name,
    value: values[name],
    onChange: (event) => setValues({ ...values, [name]: event.target.value }),
  });

  return {
    values,
    errors: {},
    submitting: false,
    formError: null,
    register,
    errorProps: (name) => ({}),
    handleSubmit: (event) => event.preventDefault(),
  };
}
