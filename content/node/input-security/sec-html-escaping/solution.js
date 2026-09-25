export class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const render = (value) => {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escape(String(value));
};

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** The explicit opt-out. Every call site is a place to review. */
export function raw(string) {
  return new SafeHtml(String(string));
}

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

export function safeUrl(url) {
  if (typeof url !== 'string') return '#';
  try {
    // The WHATWG parser strips tabs/newlines and lowercases the scheme, exactly as a browser would.
    return SAFE_SCHEMES.has(new URL(url, 'http://base.invalid').protocol) ? url : '#';
  } catch {
    return '#';
  }
}

export function renderComment({ author, body, website }) {
  const heading =
    website === undefined || website === null || website === ''
      ? html`<h3>${author}</h3>`
      : html`<h3><a href="${safeUrl(website)}" rel="nofollow ugc">${author}</a></h3>`;
  return html`<article class="comment">${heading}<p>${body}</p></article>`;
}
