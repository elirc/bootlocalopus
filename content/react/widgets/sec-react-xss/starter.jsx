export function safeHref(raw) {
  // TODO: parse with new URL(raw); allow only http:, https: and mailto:
  return raw;
}

export function Bio({ text }) {
  // TODO: **bold**, [label](url) and line breaks, built from React elements.
  // Never dangerouslySetInnerHTML.
  return <p>{text}</p>;
}
