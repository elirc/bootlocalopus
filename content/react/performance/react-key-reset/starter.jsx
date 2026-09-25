import { useState } from 'react';

function ContactEditor({ contact, onSave }) {
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);

  // Tidy: a little helper for each labelled field.
  function Field({ label, value, onChange }) {
    return (
      <label>
        {label}
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }

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
      <ContactEditor contact={selected} onSave={onSave} />
    </div>
  );
}
