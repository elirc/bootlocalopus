export function parseJson(text) {
  return JSON.parse(text);
}

export function stringifyJson(value) {
  return JSON.stringify(value);
}

export function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
