import { useEffect, useState } from 'react';

export function ProfileForm({ profile, onSave }) {
  const [values, setValues] = useState(profile);
  const [dirty, setDirty] = useState(false);

  // Keep the form in sync with the prop.
  useEffect(() => {
    setValues(profile);
  }, [profile]);

  const set = (field, value) => {
    setValues({ ...values, [field]: value });
    setDirty(true);
  };

  // TODO: compare against a baseline, send only changed fields, and move the
  // baseline to what was sent when the save succeeds.
  const submit = async (event) => {
    event.preventDefault();
    await onSave(values);
    setDirty(false);
  };

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
      <button type="submit">Save</button>
      <button type="button" onClick={() => setValues(profile)}>Discard changes</button>
      <p role="status">{dirty ? 'Unsaved changes' : ''}</p>
      <p role="alert" />
    </form>
  );
}
