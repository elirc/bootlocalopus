const ALLOWED_TAGS = new Set(['STRONG', 'A', 'BR']);
const SAFE = new Set(['http:', 'https:', 'mailto:']);

function renderBio(text) {
  const { container } = render(<solution.Bio text={text} />);
  const root = container.firstElementChild;
  assert(root && container.children.length === 1, 'Bio must render exactly one root element');
  assert(root.tagName === 'P' || root.tagName === 'DIV', 'the root must be a <p> or <div>, got <' + root.tagName.toLowerCase() + '>');
  return root;
}

/** Every structural safety property, checked on the live DOM. */
function assertSafe(root, label) {
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    // Created by React, not parsed from an HTML string.
    const owned = Object.keys(el).some((k) => k.startsWith('__reactFiber$'));
    assert(owned, label + ': <' + el.tagName.toLowerCase() + '> was not created by React (innerHTML / dangerouslySetInnerHTML?)');
    for (const attr of el.attributes) {
      assert(!/^on/i.test(attr.name), label + ': found an event-handler attribute ' + attr.name + '="' + attr.value + '"');
    }
  }
  for (const el of root.querySelectorAll('*')) {
    assert(ALLOWED_TAGS.has(el.tagName), label + ': <' + el.tagName.toLowerCase() + '> is not an allowed element');
  }
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    assert(href !== null, label + ': an <a> without href');
    let protocol = null;
    try { protocol = new URL(href).protocol; } catch { /* unparseable */ }
    assert(SAFE.has(protocol), label + ': unsafe href ' + JSON.stringify(href));
    if (a.getAttribute('target') === '_blank') {
      const rel = (a.getAttribute('rel') || '').split(/\s+/);
      assert(rel.includes('noopener') && rel.includes('noreferrer'), label + ': target=_blank without rel="noopener noreferrer"');
    }
  }
}

describe('safeHref', () => {
  it('allows http, https and mailto, returning the parsed href', () => {
    expect(solution.safeHref('https://ada.dev')).toBe('https://ada.dev/');
    expect(solution.safeHref('http://example.com/a?b=1#c')).toBe('http://example.com/a?b=1#c');
    expect(solution.safeHref('mailto:ada@example.com')).toBe('mailto:ada@example.com');
    expect(solution.safeHref('HTTPS://EXAMPLE.COM/x')).toBe('https://example.com/x');
  });

  it('rejects javascript: in every disguise', () => {
    const attempts = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      '\u0001javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'javascript\r:alert(1)',
    ];
    for (const raw of attempts) {
      expect([JSON.stringify(raw), solution.safeHref(raw)]).toEqual([JSON.stringify(raw), null]);
    }
  });

  it('rejects other script-capable and non-absolute URLs', () => {
    const attempts = [
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '/relative/path',
      '//evil.example/x',
      'java&#x09;script:alert(1)',
      '',
    ];
    for (const raw of attempts) {
      expect([raw, solution.safeHref(raw)]).toEqual([raw, null]);
    }
  });

  it('returns null for non-strings', () => {
    expect(solution.safeHref(undefined)).toBeNull();
    expect(solution.safeHref(null)).toBeNull();
    expect(solution.safeHref({ toString: () => 'https://ok.example' })).toBeNull();
  });
});

describe('Bio: legitimate formatting renders', () => {
  const bio = 'Hi, I am **Ada**.\nI write at [my blog](https://ada.dev/posts) and answer [email](mailto:ada@example.com).\n\nThanks!';

  it('keeps the text, exactly', () => {
    const root = renderBio(bio);
    expect(root.textContent).toBe('Hi, I am Ada.I write at my blog and answer email.Thanks!');
  });

  it('renders bold as <strong>', () => {
    const root = renderBio(bio);
    const strong = root.querySelectorAll('strong');
    expect(strong).toHaveLength(1);
    expect(strong[0].textContent).toBe('Ada');
  });

  it('renders one <br> per newline', () => {
    const root = renderBio(bio);
    expect(root.querySelectorAll('br')).toHaveLength(3);
  });

  it('renders safe links that open in a new tab with rel="noopener noreferrer"', () => {
    const root = renderBio(bio);
    const links = [...root.querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['my blog', 'https://ada.dev/posts'],
      ['email', 'mailto:ada@example.com'],
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      const rel = a.getAttribute('rel').split(/\s+/).sort();
      expect(rel).toEqual(['noopener', 'noreferrer']);
    }
    assertSafe(root, 'legitimate bio');
  });

  it('is reachable as a link by its label', () => {
    renderBio('see [my blog](https://ada.dev)');
    expect(screen.getByRole('link', { name: 'my blog' }).getAttribute('href')).toBe('https://ada.dev/');
  });

  it('renders an unsafe link as just its label', () => {
    const root = renderBio('please [click me](javascript:steal) now');
    expect(root.querySelectorAll('a')).toHaveLength(0);
    expect(root.textContent).toBe('please click me now');
  });

  it('leaves unmatched syntax literal', () => {
    const root = renderBio('**not bold\n[not a link] (x)\n****\n[empty]()');
    expect(root.querySelectorAll('strong, a')).toHaveLength(0);
    expect(root.textContent).toBe('**not bold[not a link] (x)****[empty]()');
  });

  it('does not let bold span a line break', () => {
    const root = renderBio('**one\ntwo**');
    expect(root.querySelectorAll('strong')).toHaveLength(0);
    expect(root.querySelectorAll('br')).toHaveLength(1);
    expect(root.textContent).toBe('**onetwo**');
  });

  it('handles several tokens on one line, in order', () => {
    const root = renderBio('**a** [b](https://b.example) **c**');
    expect([...root.querySelectorAll('strong, a')].map((el) => el.tagName + ':' + el.textContent))
      .toEqual(['STRONG:a', 'A:b', 'STRONG:c']);
    expect(root.textContent).toBe('a b c');
  });
});

describe('Bio: the payload corpus', () => {
  const corpus = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(document.cookie)</script>',
    '<svg onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](javascript:alert`1`)',
    '[click](java&#x09;script:alert(1))',
    '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[click](vbscript:msgbox(1))',
    '[x](https://ok.example" onmouseover="alert(1))',
    '[x](https://ok.example"onmouseover="alert(1))',
    '[<img src=x onerror=alert(1)>](https://ok.example)',
    '**<b onmouseover=alert(1)>hover</b>**',
    '[**x**](https://ok.example)',
    '"><img src=x onerror=alert(1)>',
    '\u0000[z](javascript:alert(1))',
  ];

  for (const payload of corpus) {
    it('stays inert: ' + JSON.stringify(payload), () => {
      const root = renderBio(payload);
      assertSafe(root, JSON.stringify(payload));
    });
  }

  it('shows HTML in the input as text', () => {
    const root = renderBio('<script>alert(document.cookie)</script>');
    expect(root.textContent).toBe('<script>alert(document.cookie)</script>');
    expect(root.querySelector('script')).toBeNull();
  });

  it('keeps a markup-looking label as text inside a safe link', () => {
    const root = renderBio('[<img src=x onerror=alert(1)>](https://ok.example)');
    const a = root.querySelectorAll('a');
    expect(a).toHaveLength(1);
    expect(a[0].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(a[0].getAttribute('href')).toBe('https://ok.example/');
  });

  it('stays inert with the whole corpus in one bio', () => {
    const root = renderBio(corpus.join('\n') + '\nand a **real** [link](https://ada.dev)');
    assertSafe(root, 'combined corpus');
    expect(root.querySelectorAll('br')).toHaveLength(corpus.length);
    const safe = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(safe).toContain('https://ada.dev/');
  });
});
