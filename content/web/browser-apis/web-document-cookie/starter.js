// A first attempt, copied from a gist.

export function parseCookies(header) {
  const cookies = {};
  for (const pair of header.split('; ')) {
    const [name, value] = pair.split('=');
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  let cookie = `${name}=${value}`;
  if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
  if (options.path) cookie += `; Path=${options.path}`;
  if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
  return cookie;
}

export function deleteCookie(name, { path, domain } = {}) {
  return `${name}=; Max-Age=0`;
}
