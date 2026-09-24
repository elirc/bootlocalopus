// An allowlist, never a blocklist: there are endless spellings of
// `javascript:` (casing, tabs, newlines, leading control characters), but the
// URL parser normalises all of them to one `protocol` value before we look.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function safeHref(raw) {
  if (typeof raw !== 'string') return null;
  let url;
  try {
    url = new URL(raw); // no base: relative and protocol-relative URLs throw
  } catch {
    return null;
  }
  // Return the parser's serialisation, not the raw input, so what we checked
  // is exactly what ends up in the attribute.
  return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
}

// One pass over a line: either **bold** or [label](url). Everything between
// matches is plain text, which React escapes for us.
const TOKEN = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function renderLine(line, lineIndex) {
  const out = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index > last) out.push(line.slice(last, match.index));
    const key = `${lineIndex}-${match.index}`;
    const [, bold, label, url] = match;
    if (bold !== undefined) {
      out.push(<strong key={key}>{bold}</strong>);
    } else {
      const href = safeHref(url);
      out.push(
        href === null
          ? label // unsafe link: keep the words, drop the link
          : (
            <a key={key} href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          ),
      );
    }
    last = match.index + match[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function Bio({ text }) {
  const lines = String(text ?? '').split('\n');
  return (
    <p>
      {lines.map((line, i) => [
        i > 0 ? <br key={`br-${i}`} /> : null,
        ...renderLine(line, i),
      ])}
    </p>
  );
}
