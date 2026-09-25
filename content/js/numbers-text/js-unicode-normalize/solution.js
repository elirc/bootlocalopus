export function sameText(a, b) {
  return a.normalize('NFC') === b.normalize('NFC');
}

export function slugify(title) {
  const slug = title
    .normalize('NFKD') // "é" -> "e" + U+0301, "ﬁ" -> "fi", "№" -> "No"
    .replace(/\p{M}/gu, '') // drop the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

const USERNAME = /^[a-z0-9_.-]{3,20}$/;

export function canonicalUsername(input) {
  // NFKC folds fullwidth letters and ligatures; the allow-list rejects everything
  // normalisation cannot fix (other scripts' look-alikes, invisible characters).
  const name = input.trim().normalize('NFKC').toLowerCase();
  return USERNAME.test(name) ? name : null;
}
