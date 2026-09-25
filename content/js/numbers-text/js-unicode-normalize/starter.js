export function sameText(a, b) {
  return a === b;
}

export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function canonicalUsername(input) {
  return input.toLowerCase();
}
