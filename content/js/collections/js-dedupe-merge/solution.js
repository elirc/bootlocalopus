const TEXT_FIELDS = ['name', 'phone', 'company'];

function normaliseEmail(email) {
  if (typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  return clean === '' ? null : clean;
}

function cleanText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function emptyContact(email) {
  // `tags` is a Set while merging, so each tag is kept once, in first-seen order.
  return { email, name: null, phone: null, company: null, tags: new Set() };
}

function absorb(target, row) {
  for (const field of TEXT_FIELDS) {
    if (target[field] === null) target[field] = cleanText(row[field]);
  }
  for (const tag of row.tags ?? []) target.tags.add(tag);
}

export function mergeContacts(contacts) {
  const byEmail = new Map();
  const out = [];

  for (const row of contacts) {
    const email = normaliseEmail(row.email);
    let target = email === null ? undefined : byEmail.get(email);
    if (!target) {
      target = emptyContact(email);
      out.push(target);
      if (email !== null) byEmail.set(email, target);
    }
    absorb(target, row);
  }

  return out.map((c) => ({ ...c, tags: [...c.tags] }));
}
