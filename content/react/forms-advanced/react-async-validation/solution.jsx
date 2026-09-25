import { useId, useRef, useState } from 'react';

const FORMAT = /^[a-z0-9_]{3,20}$/;

const MESSAGES = {
  required: 'Username is required',
  format: 'Use 3–20 lowercase letters, numbers or underscores',
  checking: 'Checking…',
  available: 'Available',
  taken: 'That username is taken',
  failed: 'Could not check the username. Try again.',
};

const INVALID = new Set(['required', 'format', 'taken']);

function formatProblem(value) {
  if (value === '') return 'required';
  if (!FORMAT.test(value)) return 'format';
  return null;
}

export function UsernameForm({ checkUsername, onSubmit }) {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState(null); // a key of MESSAGES, or null
  const inputRef = useRef(null);
  const messageId = useId();

  // The value on screen right now, readable from inside async code.
  const current = useRef('');
  // Answers we already have (username -> true/false), and checks still in
  // flight (username -> promise), so a value is never asked about twice.
  // A failed check is in neither: the next attempt asks again.
  const answers = useRef(new Map());
  const inFlight = useRef(new Map());
  const busy = useRef(false);

  const check = (value) => {
    let promise = inFlight.current.get(value);
    if (!promise) {
      promise = Promise.resolve(checkUsername(value)).then(
        (available) => {
          answers.current.set(value, available);
          inFlight.current.delete(value);
          return available;
        },
        (error) => {
          inFlight.current.delete(value);
          throw error;
        },
      );
      inFlight.current.set(value, promise);
    }
    return promise;
  };

  // Resolves to 'available' | 'taken' | 'failed', or null if the value
  // changed while waiting (the answer belongs to a value nobody is looking at).
  const lookUp = async (value) => {
    if (answers.current.has(value)) {
      const known = answers.current.get(value) ? 'available' : 'taken';
      setStatus(known);
      return known;
    }
    setStatus('checking');
    let outcome;
    try {
      outcome = (await check(value)) ? 'available' : 'taken';
    } catch {
      outcome = 'failed';
    }
    if (current.current !== value) return null;
    setStatus(outcome);
    return outcome;
  };

  const onChange = (event) => {
    current.current = event.target.value;
    setUsername(event.target.value);
    setStatus(null);
  };

  const onBlur = () => {
    const problem = formatProblem(username);
    if (problem) {
      setStatus(problem);
      return;
    }
    lookUp(username);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy.current) return;
    const value = username;
    const problem = formatProblem(value);
    if (problem) {
      setStatus(problem);
      inputRef.current?.focus();
      return;
    }
    busy.current = true;
    try {
      const outcome = await lookUp(value);
      if (outcome === 'taken') inputRef.current?.focus();
      if (outcome === 'available') await onSubmit({ username: value });
    } finally {
      busy.current = false;
    }
  };

  const invalid = status !== null && INVALID.has(status);

  return (
    <form noValidate onSubmit={submit}>
      <label>
        Username
        <input
          ref={inputRef}
          value={username}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={messageId}
        />
      </label>
      <p id={messageId}>{status ? MESSAGES[status] : ''}</p>
      <button type="submit">Create account</button>
    </form>
  );
}
