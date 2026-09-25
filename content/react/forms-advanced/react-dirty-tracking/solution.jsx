import { useState } from 'react';

/** The fields of `values` that differ from `baseline`. */
function changedFields(baseline, values) {
  const changes = {};
  for (const key of Object.keys(values)) {
    if (!Object.is(baseline[key], values[key])) changes[key] = values[key];
  }
  return changes;
}

export function ProfileForm({ profile, onSave }) {
  // Both start from the prop on mount and are never reset from it again: a
  // parent re-render with a new-but-equal object must not wipe the edits.
  const [baseline, setBaseline] = useState(profile);
  const [values, setValues] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Derived, never stored: editing a field and putting it back is clean.
  const changes = changedFields(baseline, values);
  const dirty = Object.keys(changes).length > 0;

  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!dirty) {
      setNote('No changes to save');
      return;
    }
    // Snapshot what is being sent. The user may keep typing while it saves.
    const sent = values;
    setSaving(true);
    setError('');
    try {
      await onSave(changes);
      // What was sent is now saved, and nothing more. Using the values on
      // screen here would mark edits made during the save as saved.
      setBaseline(sent);
      setNote('All changes saved');
    } catch {
      setError('Could not save your changes');
    } finally {
      setSaving(false);
    }
  };

  const status = saving ? 'Saving…' : dirty ? 'Unsaved changes' : note;

  return (
    <form onSubmit={submit}>
      <label>
        Name
        <input value={values.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        Email
        <input value={values.email} onChange={(e) => set('email', e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={values.newsletter} onChange={(e) => set('newsletter', e.target.checked)} />
        Send me the newsletter
      </label>
      <button type="submit" disabled={saving}>Save</button>
      <button type="button" onClick={() => setValues(baseline)}>Discard changes</button>
      <p role="status">{status}</p>
      <p role="alert">{error}</p>
    </form>
  );
}
