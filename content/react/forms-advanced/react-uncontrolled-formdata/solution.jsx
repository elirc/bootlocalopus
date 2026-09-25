import { useState } from 'react';

const EMPTY = { name: '', rating: null, topics: [], message: '', subscribe: false };

const RATINGS = ['1', '2', '3', '4', '5'];
const TOPICS = [
  { value: 'ui', label: 'UI' },
  { value: 'performance', label: 'Performance' },
  { value: 'docs', label: 'Docs' },
];

/** FormData holds strings (or nothing): turn it into the shape the API wants. */
function readFeedback(form) {
  const data = new FormData(form);
  return {
    name: String(data.get('name') ?? '').trim(),
    rating: Number(data.get('rating')),
    // Several checkboxes share one name: getAll, in document order.
    topics: data.getAll('topics').map(String),
    message: String(data.get('message') ?? '').trim(),
    // An unchecked checkbox is simply absent from the form data.
    subscribe: data.has('subscribe'),
  };
}

export function FeedbackForm({ onSubmit, initial = EMPTY }) {
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    // currentTarget is only set during dispatch; after the await it is null.
    const form = event.currentTarget;
    if (sending) return;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setSending(true);
    setFailed(false);
    try {
      await onSubmit(readFeedback(form));
      form.reset();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label>
        Name
        <input name="name" required defaultValue={initial.name} />
      </label>

      <fieldset>
        <legend>Rating</legend>
        {RATINGS.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="rating"
              value={value}
              required
              defaultChecked={String(initial.rating) === value}
            />
            {value}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Topics</legend>
        {TOPICS.map((topic) => (
          <label key={topic.value}>
            <input
              type="checkbox"
              name="topics"
              value={topic.value}
              defaultChecked={initial.topics.includes(topic.value)}
            />
            {topic.label}
          </label>
        ))}
      </fieldset>

      <label>
        Message
        <textarea name="message" defaultValue={initial.message} />
      </label>

      <label>
        <input type="checkbox" name="subscribe" defaultChecked={initial.subscribe} />
        Email me updates
      </label>

      <button type="submit" disabled={sending}>Send feedback</button>
      <p role="alert">{failed ? 'Could not send feedback' : ''}</p>
    </form>
  );
}
