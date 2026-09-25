// Every special value becomes { "$type": <tag>, "value": <payload> }.
const TAG = '$type';

// Walk the value ourselves instead of using a replacer: a replacer only ever
// sees a Date after Date.prototype.toJSON has turned it into a string.
function toWire(value) {
  if (value === undefined) return { [TAG]: 'undefined' };
  if (typeof value === 'bigint') return { [TAG]: 'BigInt', value: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value)) return { [TAG]: 'Number', value: String(value) };
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Date) {
    const time = value.getTime();
    return { [TAG]: 'Date', value: Number.isNaN(time) ? null : value.toISOString() };
  }
  if (value instanceof Map) {
    return { [TAG]: 'Map', value: Array.from(value, ([k, v]) => [toWire(k), toWire(v)]) };
  }
  if (value instanceof Set) return { [TAG]: 'Set', value: Array.from(value, toWire) };
  if (Array.isArray(value)) return Array.from(value, toWire);
  if (typeof value.toJSON === 'function') return toWire(value.toJSON());

  const out = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v === 'function' || typeof v === 'symbol') continue; // as JSON.stringify does
    Object.defineProperty(out, key, { value: toWire(v), enumerable: true, writable: true, configurable: true });
  }
  // User data that looks like a tag is wrapped so decode cannot mistake it.
  return Object.hasOwn(value, TAG) ? { [TAG]: 'Object', value: out } : out;
}

export function encode(value) {
  return JSON.stringify(toWire(value));
}

function plainFromWire(obj) {
  // defineProperty, not assignment: a "__proto__" key must stay an own key.
  const out = {};
  for (const key of Object.keys(obj)) {
    Object.defineProperty(out, key, { value: fromWire(obj[key]), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

function fromWire(json) {
  if (json === null || typeof json !== 'object') return json;
  if (Array.isArray(json)) return json.map(fromWire);
  if (!Object.hasOwn(json, TAG)) return plainFromWire(json);

  const payload = json.value;
  switch (json[TAG]) {
    case 'undefined': return undefined;
    case 'BigInt': return BigInt(payload);
    case 'Number': return Number(payload);
    case 'Date': return new Date(payload ?? NaN);
    case 'Map': return new Map(payload.map(([k, v]) => [fromWire(k), fromWire(v)]));
    case 'Set': return new Set(payload.map(fromWire));
    case 'Object': return plainFromWire(payload);
    default: throw new TypeError(`decode: unknown ${TAG} "${json[TAG]}"`);
  }
}

export function decode(text) {
  // No reviver: returning undefined from one deletes the key.
  return fromWire(JSON.parse(text));
}
