export class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export function html(strings, ...values) {
  // TODO: escape each value unless it is SafeHtml; handle arrays and null/undefined/false.
  return new SafeHtml(String.raw(strings, ...values));
}

export function raw(string) {
  return new SafeHtml(String(string));
}

export function safeUrl(url) {
  // TODO: allow only http:, https: and mailto: — using a real URL parser.
  return url;
}

export function renderComment({ author, body, website }) {
  return html`<article class="comment"><h3><a href="${website}" rel="nofollow ugc">${author}</a></h3><p>${body}</p></article>`;
}
