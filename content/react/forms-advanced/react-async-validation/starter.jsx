import { useId, useRef, useState } from 'react';

export function UsernameForm({ checkUsername, onSubmit }) {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');

  // TODO: validate the format, check on blur (not on every keystroke),
  // remember answers, ignore late ones, and make submit wait for the check.
  const onChange = async (event) => {
    setUsername(event.target.value);
    setMessage('Checking…');
    const available = await checkUsername(event.target.value);
    setMessage(available ? 'Available' : 'That username is taken');
  };

  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); onSubmit({ username }); }}>
      <label>
        Username
        <input value={username} onChange={onChange} />
      </label>
      <p>{message}</p>
      <button type="submit">Create account</button>
    </form>
  );
}
