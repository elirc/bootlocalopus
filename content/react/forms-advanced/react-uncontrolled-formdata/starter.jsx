import { useState } from 'react';

const EMPTY = { name: '', rating: null, topics: [], message: '', subscribe: false };

export function FeedbackForm({ onSubmit, initial = EMPTY }) {
  // TODO: read the whole form with FormData on submit, convert each value to
  // the right type, and reset the form after a successful send.
  const submit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await onSubmit(data);
    event.currentTarget.reset();
  };

  return (
    <form onSubmit={submit}>
      <label>
        Name
        <input name="name" defaultValue={initial.name} />
      </label>
      <label>
        Message
        <textarea name="message" defaultValue={initial.message} />
      </label>
      <button type="submit">Send feedback</button>
    </form>
  );
}
