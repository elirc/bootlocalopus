const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None' };

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // a stray % must not take the whole parser down
  }
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(';')) {
    const pair = part.trim();
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    // Split at the FIRST '=': base64 values end in '='.
    let value = pair.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!Object.hasOwn(cookies, name)) cookies[name] = safeDecode(value);
  }
  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  const { maxAge, expires, domain, path, secure, httpOnly, sameSite, partitioned } = options;
  if (!TOKEN.test(name)) throw new TypeError(`Invalid cookie name: "${name}"`);

  const parts = [`${name}=${encodeURIComponent(String(value))}`];

  if (maxAge !== undefined) {
    if (!Number.isInteger(maxAge)) throw new TypeError('maxAge must be an integer number of seconds');
    parts.push(`Max-Age=${maxAge}`);
  }
  if (expires !== undefined) {
    if (!(expires instanceof Date) || Number.isNaN(expires.getTime())) throw new TypeError('expires must be a valid Date');
    parts.push(`Expires=${expires.toUTCString()}`);
  }
  if (domain !== undefined) parts.push(`Domain=${domain}`);
  if (path !== undefined) parts.push(`Path=${path}`);
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');

  if (sameSite !== undefined) {
    const normalised = SAME_SITE[String(sameSite).toLowerCase()];
    if (!normalised) throw new TypeError(`Invalid sameSite: "${sameSite}"`);
    // Browsers drop SameSite=None cookies that are not Secure.
    if (normalised === 'None' && !secure) throw new TypeError('SameSite=None requires secure');
    parts.push(`SameSite=${normalised}`);
  }
  if (partitioned) {
    if (!secure) throw new TypeError('Partitioned requires secure');
    parts.push('Partitioned');
  }

  if (name.startsWith('__Secure-') && !secure) throw new TypeError('__Secure- cookies require secure');
  if (name.startsWith('__Host-') && (!secure || path !== '/' || domain !== undefined)) {
    throw new TypeError('__Host- cookies require secure, path "/" and no domain');
  }

  return parts.join('; ');
}

export function deleteCookie(name, { path, domain } = {}) {
  const secure = name.startsWith('__Secure-') || name.startsWith('__Host-');
  // Same name, path and domain, or it is a different cookie and survives.
  return serializeCookie(name, '', { maxAge: 0, path, domain, secure });
}
