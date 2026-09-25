import { useState } from 'react';

// Declared once, at module level. A component declared inside another one is
// a brand-new type on every render, so React unmounts the old <input> and
// mounts a fresh one on each keystroke, and focus is lost with it.
function Field({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ContactEditor({ contact, onSave }) {
  // useState reads its argument on the first render only. That is fine here
  // because the parent gives each contact its own editor instance (see key).
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);

  return (
    <form
      aria-label="Edit contact"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ id: contact.id, name, email });
      }}
    >
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Email" value={email} onChange={setEmail} />
      <button type="submit">Save</button>
    </form>
  );
}

export function ContactsApp({ contacts, onSave }) {
  const [selectedId, setSelectedId] = useState(contacts[0].id);
  const selected = contacts.find((contact) => contact.id === selectedId);

  return (
    <div>
      <nav aria-label="Contacts">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            type="button"
            aria-current={contact.id === selectedId ? 'true' : undefined}
            onClick={() => setSelectedId(contact.id)}
          >
            {contact.name}
          </button>
        ))}
      </nav>
      {/* Same type at the same position means React keeps its state. A new
          key says "this is a different editor": the old one (and its draft)
          is thrown away and a fresh one starts from the selected contact. */}
      <ContactEditor key={selected.id} contact={selected} onSave={onSave} />
    </div>
  );
}
